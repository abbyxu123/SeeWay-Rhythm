import { z } from "zod";

const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

const QimenNarrationContextSchema = z
  .object({
    verificationStatus: z.enum(["verified", "blocked"]),
    chartHash: Sha256Schema,
    expectedChartHash: Sha256Schema,
  })
  .strict()
  .readonly();

export const VoiceRouteInputSchema = z
  .object({
    transcript: z.string().trim().min(1).max(500),
    qimenContext: QimenNarrationContextSchema.optional(),
  })
  .strict()
  .readonly();

export type PersonalVoiceTopic =
  | "work"
  | "travel"
  | "communication"
  | "study";

export type VoiceRouteDecision =
  | Readonly<{
      status: "ready";
      route: "general-chat";
      topic: "general";
    }>
  | Readonly<{
      status: "ready";
      route: "qimen-market";
      topic: "market";
    }>
  | Readonly<{
      status: "ready";
      route: "personal-qimen";
      topic: PersonalVoiceTopic;
      chartHash: string;
    }>
  | Readonly<{
      status: "needs_clarification";
      route: "clarify";
      topic: "general";
      prompt: string;
    }>
  | Readonly<{
      status: "blocked";
      route: "personal-qimen";
      topic: PersonalVoiceTopic;
      reasonCode:
        | "missing_verified_context"
        | "unverified_context"
        | "chart_hash_mismatch";
    }>;

const MarketPattern = /股票|股市|A\s*股|美股|港股|大盘|行情|交易节奏|交易窗口|标的|基金/i;
const DecisionCuePattern = /适合|可以|能不能|要不要|好不好|怎么样|时辰|方位|注意|建议/;
const AmbiguousPattern =
  /(?:我)?今天怎么样|帮我看看(?:这个)?事情|最近.*(?:钱|财富|投资).*?(?:怎么样|行不行|好不好)/;

const PersonalTopicPatterns = Object.freeze([
  ["work", /工作|事业|合作|项目|推进|开会|签约/],
  ["travel", /出门|出行|旅行|机场|开车|交通|方位|方向/],
  ["communication", /沟通|谈判|争吵|口舌|对方|联系/],
  ["study", /学习|考试|复习|专注|读书/],
] as const satisfies readonly [PersonalVoiceTopic, RegExp][]);

export function routeVoiceQuestion(rawInput: unknown): VoiceRouteDecision {
  const input = VoiceRouteInputSchema.parse(rawInput);
  const transcript = input.transcript;

  if (MarketPattern.test(transcript)) {
    return Object.freeze({
      status: "ready",
      route: "qimen-market",
      topic: "market",
    });
  }

  const topic = classifyPersonalTopic(transcript);
  if (topic !== null) {
    return authorizePersonalQimen(topic, input.qimenContext);
  }

  if (AmbiguousPattern.test(transcript)) {
    return Object.freeze({
      status: "needs_clarification",
      route: "clarify",
      topic: "general",
      prompt: "你想看工作、出行、沟通、学习，还是市场方面？",
    });
  }

  return Object.freeze({
    status: "ready",
    route: "general-chat",
    topic: "general",
  });
}

function classifyPersonalTopic(transcript: string): PersonalVoiceTopic | null {
  if (!DecisionCuePattern.test(transcript)) {
    return null;
  }
  for (const [topic, pattern] of PersonalTopicPatterns) {
    if (pattern.test(transcript)) {
      return topic;
    }
  }
  return null;
}

function authorizePersonalQimen(
  topic: PersonalVoiceTopic,
  context: z.infer<typeof QimenNarrationContextSchema> | undefined,
): VoiceRouteDecision {
  if (context === undefined) {
    return Object.freeze({
      status: "blocked",
      route: "personal-qimen",
      topic,
      reasonCode: "missing_verified_context",
    });
  }
  if (context.verificationStatus !== "verified") {
    return Object.freeze({
      status: "blocked",
      route: "personal-qimen",
      topic,
      reasonCode: "unverified_context",
    });
  }
  if (context.chartHash !== context.expectedChartHash) {
    return Object.freeze({
      status: "blocked",
      route: "personal-qimen",
      topic,
      reasonCode: "chart_hash_mismatch",
    });
  }
  return Object.freeze({
    status: "ready",
    route: "personal-qimen",
    topic,
    chartHash: context.chartHash,
  });
}
