import {
  VOICE_QUESTION_VERSION,
  VOICE_RESPONSE_VERSION,
  VoiceProfileRefSchema,
  VoiceQuestionSchema,
  VoiceResponseSchema,
  VoiceRuntimeLocationSchema,
  type DevicePayload,
  type VoiceProfileRef,
  type VoiceQuestion,
  type VoiceResponse,
  type VoiceRuntimeLocation,
} from "@seeway/contracts";
import {
  QIMEN_VERIFIER_VERSION,
  QimenSourceReferenceSchema,
  calculateQimenChart,
  type QimenSourceReference,
} from "@seeway/qimen-core";
import { buildTimeContext, resolveCivilTime } from "@seeway/time-core";
import { z } from "zod";
import { buildQimenDevicePayload } from "./device-payload";
import type { BirthProfileStore } from "./profile-store";
import { routeVoiceQuestion, type PersonalVoiceTopic } from "./voice-router";

const IdentifierSchema = z.string().min(1).max(160).refine(
  (value) => value === value.trim(),
  "Identifier must not contain surrounding whitespace.",
);
const OffsetDateTimeSchema = z.iso.datetime({ offset: true });
const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const CurrentContextInputSchema = z.object({
  profileRef: VoiceProfileRefSchema.optional(),
  runtimeLocation: VoiceRuntimeLocationSchema.optional(),
  targetTime: OffsetDateTimeSchema.optional(),
}).strict();
const VoiceServiceQuestionInputSchema = CurrentContextInputSchema.extend({
  questionId: IdentifierSchema,
  transcript: z.string().trim().min(1).max(500),
  capturedAt: OffsetDateTimeSchema,
  expectedChartHash: Sha256Schema.optional(),
}).strict();

export type VoiceBlockReason =
  | "missing_profile"
  | "missing_runtime_location"
  | "missing_target_time"
  | "missing_payload"
  | "unverified_context"
  | "chart_hash_mismatch"
  | "market_not_available"
  | "invalid_time_context";

export type VoiceCurrentContext =
  | Readonly<{
      status: "verified";
      profileRef: VoiceProfileRef;
      runtimeLocation: VoiceRuntimeLocation;
      targetTime: string;
      chartHash: string;
      validFrom: string;
      validUntil: string;
      payload: DevicePayload;
    }>
  | Readonly<{
      status: "blocked";
      reasonCode: VoiceBlockReason;
      issueCodes: readonly string[];
    }>;

export type VoiceJobStatus =
  | Readonly<{
      questionId: string;
      status: "pending";
      route: "personal-qimen";
      topic: PersonalVoiceTopic;
    }>
  | Readonly<{ questionId: string; status: "completed"; response: VoiceResponse }>
  | Readonly<{ questionId: string; status: "blocked"; reasonCode: VoiceBlockReason }>
  | Readonly<{ questionId: string; status: "needs_clarification"; prompt: string }>
  | Readonly<{ questionId: string; status: "delegated"; route: "general-chat" }>
  | Readonly<{ questionId: string; status: "cancelled" }>
  | Readonly<{ questionId: string; status: "not_found" }>;

interface PendingQuestion {
  readonly question: Extract<VoiceQuestion, { basis: "qimen" }>;
  readonly expectedChartHash: string;
}

interface VoiceServiceOptions {
  readonly profileStore: BirthProfileStore;
  readonly sourceReference: QimenSourceReference;
  readonly clock: () => Date;
}

export interface VoiceService {
  readonly getCurrentContext: (input: unknown) => VoiceCurrentContext;
  readonly submitQuestion: (input: unknown) => VoiceJobStatus;
  readonly processQuestion: (questionId: string) => VoiceJobStatus;
  readonly getResponseStatus: (questionId: string) => VoiceJobStatus;
  readonly cancelQuestion: (questionId: string) => VoiceJobStatus;
}

function freeze<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function blockedContext(
  reasonCode: VoiceBlockReason,
  issueCodes: readonly string[] = [],
): VoiceCurrentContext {
  return freeze({
    status: "blocked" as const,
    reasonCode,
    issueCodes: Object.freeze([...issueCodes]),
  });
}

function localDateTimeAt(instant: string, timeZone: string): string {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Target time is not a valid instant.");
  }
  const byType = new Map(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map(({ type, value }) => [type, value]),
  );
  const year = byType.get("year");
  const month = byType.get("month");
  const day = byType.get("day");
  const hour = byType.get("hour");
  const minute = byType.get("minute");
  const second = byType.get("second");
  if (!year || !month || !day || !hour || !minute || !second) {
    throw new RangeError("Target time could not be localized.");
  }
  return [
    year,
    "-",
    month,
    "-",
    day,
    "T",
    hour,
    ":",
    minute,
    ":",
    second,
  ].join("");
}

function offsetDateTime(value: string): string {
  return value.replace(/\[[^\]]+\]$/, "");
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function boundedText(value: string, maximum: number): string {
  return value.length <= maximum
    ? value
    : value.slice(0, maximum - 1) + "…";
}

function responseFromPayload(
  question: Extract<VoiceQuestion, { basis: "qimen" }>,
  context: Extract<VoiceCurrentContext, { status: "verified" }>,
  generatedAt: string,
): VoiceResponse | undefined {
  const rows = context.payload.rows;
  const evidenceIds = distinct([
    ...rows.favorable.evidenceIds,
    ...rows.caution.evidenceIds,
    ...rows.direction.evidenceIds,
    ...rows.advice.evidenceIds,
  ]);
  if (evidenceIds.length === 0) {
    return undefined;
  }
  const favorable = rows.favorable.text ?? "暂无足够规则";
  const caution = rows.caution.text ?? "暂无足够规则";
  const direction = rows.direction.text ?? "暂无足够规则";
  const advice = rows.advice.text ?? "暂无足够规则";
  return VoiceResponseSchema.parse({
    contractVersion: VOICE_RESPONSE_VERSION,
    responseId: ("voice-response-" + question.questionId).slice(0, 160),
    questionId: question.questionId,
    basis: "qimen",
    topic: question.topic,
    displayText: boundedText(
      "有利：" + favorable + "；建议：" + advice,
      80,
    ),
    spokenAnswer: boundedText(
      "按当前已校验时辰盘，有利：" + favorable +
        "。注意：" + caution +
        "。方位：" + direction +
        "。建议：" + advice +
        "。这是当前八门通用层结论，不代替具体领域的专业判断。",
      600,
    ),
    generatedAt,
    profileRef: question.profileRef,
    runtimeLocation: question.runtimeLocation,
    targetTime: question.targetTime,
    chartHash: context.chartHash,
    verification: {
      status: "verified",
      verifierVersion: QIMEN_VERIFIER_VERSION,
      verifiedAt: generatedAt,
    },
    validFrom: context.validFrom,
    validUntil: context.validUntil,
    evidenceIds,
  });
}

export function createVoiceService(
  options: VoiceServiceOptions,
): Readonly<VoiceService> {
  const sourceReference = QimenSourceReferenceSchema.parse(options.sourceReference);
  const statuses = new Map<string, VoiceJobStatus>();
  const pending = new Map<string, PendingQuestion>();

  function store(status: VoiceJobStatus): VoiceJobStatus {
    statuses.set(status.questionId, status);
    return status;
  }

  function blockQuestion(
    questionId: string,
    reasonCode: VoiceBlockReason,
  ): VoiceJobStatus {
    return store(freeze({ questionId, status: "blocked" as const, reasonCode }));
  }

  function getCurrentContext(rawInput: unknown): VoiceCurrentContext {
    const input = CurrentContextInputSchema.parse(rawInput);
    if (!input.profileRef) return blockedContext("missing_profile");
    if (!input.runtimeLocation) return blockedContext("missing_runtime_location");
    if (!input.targetTime) return blockedContext("missing_target_time");
    const profile = options.profileStore.get(
      input.profileRef.profileId,
      input.profileRef.profileVersion,
    );
    if (!profile) return blockedContext("missing_profile");

    try {
      const timeContext = buildTimeContext(resolveCivilTime({
        localDateTime: localDateTimeAt(
          input.targetTime,
          input.runtimeLocation.timeZone,
        ),
        timeZone: input.runtimeLocation.timeZone,
        precision: "second",
      }));
      const chart = calculateQimenChart(timeContext, sourceReference);
      const payload = buildQimenDevicePayload({
        calculatedAt: options.clock().toISOString(),
        selection: "current",
        profile,
        timeContext,
        chart,
      });
      if (
        payload.verification.status !== "verified" ||
        payload.guidanceStatus !== "derived" ||
        payload.chartHash === null ||
        payload.chart === null
      ) {
        return blockedContext(
          "unverified_context",
          payload.verification.issueCodes,
        );
      }
      return freeze({
        status: "verified" as const,
        profileRef: input.profileRef,
        runtimeLocation: input.runtimeLocation,
        targetTime: input.targetTime,
        chartHash: payload.chartHash,
        validFrom: offsetDateTime(payload.targetShichen.startLocal),
        validUntil: offsetDateTime(payload.targetShichen.endLocal),
        payload,
      });
    } catch {
      return blockedContext("invalid_time_context");
    }
  }

  function submitQuestion(rawInput: unknown): VoiceJobStatus {
    const input = VoiceServiceQuestionInputSchema.parse(rawInput);
    if (statuses.has(input.questionId)) {
      throw new Error(
        "Voice question " + input.questionId + " already exists.",
      );
    }
    const firstRoute = routeVoiceQuestion({ transcript: input.transcript });
    if (firstRoute.status === "needs_clarification") {
      return store(freeze({
        questionId: input.questionId,
        status: "needs_clarification" as const,
        prompt: firstRoute.prompt,
      }));
    }
    if (firstRoute.status === "ready" && firstRoute.route === "general-chat") {
      return store(freeze({
        questionId: input.questionId,
        status: "delegated" as const,
        route: "general-chat" as const,
      }));
    }
    if (firstRoute.status === "ready" && firstRoute.route === "qimen-market") {
      return blockQuestion(input.questionId, "market_not_available");
    }
    if (!input.profileRef) return blockQuestion(input.questionId, "missing_profile");
    if (!input.runtimeLocation) {
      return blockQuestion(input.questionId, "missing_runtime_location");
    }
    if (!input.targetTime) {
      return blockQuestion(input.questionId, "missing_target_time");
    }
    if (!input.expectedChartHash) {
      return blockQuestion(input.questionId, "missing_payload");
    }

    const context = getCurrentContext({
      profileRef: input.profileRef,
      runtimeLocation: input.runtimeLocation,
      targetTime: input.targetTime,
    });
    if (context.status !== "verified") {
      return blockQuestion(input.questionId, context.reasonCode);
    }
    const routed = routeVoiceQuestion({
      transcript: input.transcript,
      qimenContext: {
        verificationStatus: "verified",
        chartHash: context.chartHash,
        expectedChartHash: input.expectedChartHash,
      },
    });
    if (routed.status !== "ready" || routed.route !== "personal-qimen") {
      return blockQuestion(
        input.questionId,
        routed.status === "blocked" &&
          routed.reasonCode === "chart_hash_mismatch"
          ? "chart_hash_mismatch"
          : "unverified_context",
      );
    }

    const question = VoiceQuestionSchema.parse({
      contractVersion: VOICE_QUESTION_VERSION,
      questionId: input.questionId,
      basis: "qimen",
      topic: routed.topic,
      transcript: input.transcript,
      capturedAt: input.capturedAt,
      profileRef: input.profileRef,
      runtimeLocation: input.runtimeLocation,
      targetTime: input.targetTime,
    });
    if (question.basis !== "qimen") {
      throw new Error("Personal Qimen routing produced a general question.");
    }
    const status = freeze({
      questionId: input.questionId,
      status: "pending" as const,
      route: "personal-qimen" as const,
      topic: routed.topic,
    });
    pending.set(input.questionId, {
      question,
      expectedChartHash: input.expectedChartHash,
    });
    return store(status);
  }

  function getResponseStatus(questionId: string): VoiceJobStatus {
    const parsedId = IdentifierSchema.parse(questionId);
    return statuses.get(parsedId) ??
      freeze({ questionId: parsedId, status: "not_found" as const });
  }

  function processQuestion(questionId: string): VoiceJobStatus {
    const current = getResponseStatus(questionId);
    if (current.status !== "pending") return current;
    const job = pending.get(questionId);
    if (!job) return blockQuestion(questionId, "missing_payload");
    const context = getCurrentContext({
      profileRef: job.question.profileRef,
      runtimeLocation: job.question.runtimeLocation,
      targetTime: job.question.targetTime,
    });
    if (context.status !== "verified") {
      pending.delete(questionId);
      return blockQuestion(questionId, context.reasonCode);
    }
    if (context.chartHash !== job.expectedChartHash) {
      pending.delete(questionId);
      return blockQuestion(questionId, "chart_hash_mismatch");
    }
    const response = responseFromPayload(
      job.question,
      context,
      options.clock().toISOString(),
    );
    pending.delete(questionId);
    if (!response) return blockQuestion(questionId, "unverified_context");
    return store(freeze({
      questionId,
      status: "completed" as const,
      response,
    }));
  }

  function cancelQuestion(questionId: string): VoiceJobStatus {
    const current = getResponseStatus(questionId);
    if (current.status !== "pending") return current;
    pending.delete(questionId);
    return store(freeze({ questionId, status: "cancelled" as const }));
  }

  return freeze({
    getCurrentContext,
    submitQuestion,
    processQuestion,
    getResponseStatus,
    cancelQuestion,
  });
}
