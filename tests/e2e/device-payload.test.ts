import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BIRTH_PROFILE_CONTRACT_VERSION,
  DevicePayloadSchema,
} from "@seeway/contracts";
import { buildQimenDevicePayload } from "@seeway/control-plane";
import {
  QimenGoldenFixtureSchema,
  calculateQimenChart,
} from "@seeway/qimen-core";
import { buildTimeContext, resolveCivilTime } from "@seeway/time-core";
import { describe, expect, it } from "vitest";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const fixture = QimenGoldenFixtureSchema.parse(
  JSON.parse(
    readFileSync(
      resolve(TEST_DIRECTORY, "../fixtures/qimen-golden/verified-cases.json"),
      "utf8",
    ),
  ),
);

const profile = {
  contractVersion: BIRTH_PROFILE_CONTRACT_VERSION,
  profileId: "profile-device-test",
  profileVersion: 3,
  originalBirthInput: {
    calendar: "gregorian",
    precision: "minute",
    localDateTime: "1988-04-12T06:45",
    timeZone: "Asia/Shanghai",
    placeText: "浙江省杭州市",
  },
} as const;

function verifiedInput(caseIndex = 0) {
  const goldenCase = fixture.cases[caseIndex]!;
  const timeContext = buildTimeContext(resolveCivilTime(goldenCase.input));
  const chart = calculateQimenChart(
    timeContext,
    goldenCase.chart.sourceReferences[0]!,
  );
  return { timeContext, chart };
}

describe("verified chart to device payload", () => {
  it("builds a deterministic, cited four-row payload from an authentic chart", () => {
    const { timeContext, chart } = verifiedInput();
    const input = {
      calculatedAt: timeContext.civil.instant,
      selection: "current" as const,
      profile,
      timeContext,
      chart,
    };

    const first = buildQimenDevicePayload(input);
    const second = buildQimenDevicePayload(input);

    expect(DevicePayloadSchema.parse(first)).toEqual(first);
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      profileRef: { profileId: profile.profileId, profileVersion: 3 },
      verification: { status: "verified", issueCodes: [] },
      guidanceStatus: "derived",
      chartHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    expect(first.rows.direction.text).toMatch(/利|慎/);
    expect(first.rows.advice.evidenceIds.length).toBeGreaterThan(0);
    expect(first.ruleIds.every((ruleId) => ruleId.startsWith("QG-GATE-"))).toBe(
      true,
    );
    expect(first.chart?.palaces).toHaveLength(9);
    expect(first.chart?.palaces.find(({ palaceNumber }) => palaceNumber === 5))
      .toMatchObject({ gate: null, deity: null, stars: [] });
  });

  it("fails closed when a structurally valid chart loses calculator authenticity", () => {
    const { timeContext, chart } = verifiedInput();
    const result = buildQimenDevicePayload({
      calculatedAt: timeContext.civil.instant,
      selection: "current",
      profile,
      timeContext,
      chart: structuredClone(chart),
    });

    expect(result.verification.status).toBe("blocked");
    expect(result.verification.issueCodes).toContain(
      "calculator_not_authenticated",
    );
    expect(result.chartHash).toBeNull();
    expect(result.chart).toBeNull();
    expect(result.ruleIds).toEqual([]);
    expect(Object.values(result.rows).every(({ text }) => text === null)).toBe(
      true,
    );
  });

  it("keeps current and next payload slots explicit", () => {
    const current = verifiedInput(1);
    const next = verifiedInput(2);
    const currentPayload = buildQimenDevicePayload({
      calculatedAt: current.timeContext.civil.instant,
      selection: "current",
      profile,
      ...current,
    });
    const nextPayload = buildQimenDevicePayload({
      calculatedAt: next.timeContext.civil.instant,
      selection: "next",
      profile,
      ...next,
    });

    expect(currentPayload.targetShichen.selection).toBe("current");
    expect(nextPayload.targetShichen.selection).toBe("next");
    expect(currentPayload.profileRef).toEqual(nextPayload.profileRef);
    expect(currentPayload.chartHash).not.toBe(nextPayload.chartHash);
  });
});
