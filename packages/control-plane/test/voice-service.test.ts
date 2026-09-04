import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VOICE_RESPONSE_VERSION } from "@seeway/contracts";
import {
  createBirthProfileStore,
  createVoiceService,
} from "@seeway/control-plane";
import { QimenGoldenFixtureSchema } from "@seeway/qimen-core";
import { describe, expect, it } from "vitest";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const fixture = QimenGoldenFixtureSchema.parse(
  JSON.parse(
    readFileSync(
      resolve(
        TEST_DIRECTORY,
        "../../../tests/fixtures/qimen-golden/verified-cases.json",
      ),
      "utf8",
    ),
  ),
);
const sourceReference = fixture.cases[0]!.chart.sourceReferences[0]!;
const profileRef = {
  profileId: "profile-1990-test",
  profileVersion: 1,
} as const;
const runtimeLocation = {
  label: "上海市",
  timeZone: "Asia/Shanghai",
  longitude: 121.4737,
  latitude: 31.2304,
} as const;
const targetTime = "1997-03-19T21:15:00+08:00";

function createSubject() {
  const profileStore = createBirthProfileStore();
  profileStore.create({
    profileId: profileRef.profileId,
    displayName: "测试用户",
    sex: "female",
    originalBirthInput: {
      calendar: "gregorian",
      precision: "minute",
      localDateTime: "1990-12-03T15:02",
      timeZone: "Asia/Shanghai",
      placeText: "黑龙江省哈尔滨市依兰县",
    },
  });
  return createVoiceService({
    profileStore,
    sourceReference,
    clock: () => new Date("1997-03-19T13:15:05Z"),
  });
}

function requireVerifiedContext(service: ReturnType<typeof createSubject>) {
  const context = service.getCurrentContext({
    profileRef,
    runtimeLocation,
    targetTime,
  });
  expect(context.status).toBe("verified");
  if (context.status !== "verified") {
    throw new Error(`Expected verified context, got ${context.reasonCode}.`);
  }
  return context;
}

describe("verified XiaoZhi Qimen voice service", () => {
  it("recomputes the current chart before producing a cited spoken response", () => {
    const service = createSubject();
    const context = requireVerifiedContext(service);

    const submission = service.submitQuestion({
      questionId: "voice-qimen-work-1",
      transcript: "这个时辰适合推进工作合作吗？",
      capturedAt: "1997-03-19T21:15:02+08:00",
      profileRef,
      runtimeLocation,
      targetTime,
      expectedChartHash: context.chartHash,
    });
    expect(submission).toEqual({
      questionId: "voice-qimen-work-1",
      status: "pending",
      route: "personal-qimen",
      topic: "work",
    });

    const completed = service.processQuestion("voice-qimen-work-1");
    expect(completed.status).toBe("completed");
    if (completed.status !== "completed") {
      throw new Error(`Expected completed response, got ${completed.status}.`);
    }
    expect(completed.response).toMatchObject({
      contractVersion: VOICE_RESPONSE_VERSION,
      questionId: "voice-qimen-work-1",
      basis: "qimen",
      topic: "work",
      chartHash: context.chartHash,
      verification: {
        status: "verified",
        verifierVersion: "qimen-verifier/v1",
      },
      profileRef,
      runtimeLocation,
    });
    expect(completed.response.spokenAnswer).toContain("已校验时辰盘");
    expect(completed.response.spokenAnswer).toContain("有利");
    expect(completed.response.spokenAnswer).toContain("注意");
    expect(completed.response.spokenAnswer).toContain("方位");
    expect(completed.response.spokenAnswer).toContain("建议");
    expect(completed.response.evidenceIds.length).toBeGreaterThan(0);
    expect(service.getResponseStatus("voice-qimen-work-1")).toEqual(completed);
  });

  it("blocks narration when profile, location, payload hash or hash match is absent", () => {
    const service = createSubject();
    const context = requireVerifiedContext(service);
    const common = {
      transcript: "这个时辰适合出行吗？",
      capturedAt: "1997-03-19T21:15:02+08:00",
      targetTime,
    } as const;

    expect(
      service.submitQuestion({
        ...common,
        questionId: "missing-profile",
        runtimeLocation,
        expectedChartHash: context.chartHash,
      }),
    ).toMatchObject({ status: "blocked", reasonCode: "missing_profile" });
    expect(
      service.submitQuestion({
        ...common,
        questionId: "missing-location",
        profileRef,
        expectedChartHash: context.chartHash,
      }),
    ).toMatchObject({
      status: "blocked",
      reasonCode: "missing_runtime_location",
    });
    expect(
      service.submitQuestion({
        ...common,
        questionId: "missing-payload",
        profileRef,
        runtimeLocation,
      }),
    ).toMatchObject({ status: "blocked", reasonCode: "missing_payload" });
    expect(
      service.submitQuestion({
        ...common,
        questionId: "wrong-hash",
        profileRef,
        runtimeLocation,
        expectedChartHash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    ).toMatchObject({ status: "blocked", reasonCode: "chart_hash_mismatch" });
  });

  it("keeps general chat outside Qimen and lets a pending question be cancelled", () => {
    const service = createSubject();
    expect(
      service.submitQuestion({
        questionId: "voice-general-1",
        transcript: "陪我聊两句吧",
        capturedAt: "1997-03-19T21:15:02+08:00",
      }),
    ).toEqual({
      questionId: "voice-general-1",
      status: "delegated",
      route: "general-chat",
    });

    const context = requireVerifiedContext(service);
    service.submitQuestion({
      questionId: "voice-qimen-cancel-1",
      transcript: "这个时辰适合学习吗？",
      capturedAt: "1997-03-19T21:15:02+08:00",
      profileRef,
      runtimeLocation,
      targetTime,
      expectedChartHash: context.chartHash,
    });
    expect(service.cancelQuestion("voice-qimen-cancel-1")).toEqual({
      questionId: "voice-qimen-cancel-1",
      status: "cancelled",
    });
    expect(service.processQuestion("voice-qimen-cancel-1")).toEqual({
      questionId: "voice-qimen-cancel-1",
      status: "cancelled",
    });
  });
});
