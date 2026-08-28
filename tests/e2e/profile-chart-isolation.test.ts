import { createHash } from "node:crypto";
import type { BirthProfile } from "@seeway/contracts";
import { createBirthProfileStore } from "@seeway/control-plane";
import { calculateQimenChart, type QimenChart } from "@seeway/qimen-core";
import { buildTimeContext, resolveCivilTime } from "@seeway/time-core";
import { describe, expect, it } from "vitest";

const SOURCE_REFERENCE = {
  sourceId: "zhang-advanced-course-notes",
  title: "河北周易研究会奇门遁甲高级班笔记",
  locator: "PDF第5页，例四",
  fingerprint:
    "sha256:4ee9788e2fcc577a66c5aef83a50f353b01e2dec50915fa799c8b7473fecbc47",
} as const;

function chartHash(chart: QimenChart): string {
  return createHash("sha256").update(JSON.stringify(chart)).digest("hex");
}

function calculateForProfile(
  profile: BirthProfile,
  targetLocalDateTime: string,
) {
  const targetTime = buildTimeContext(
    resolveCivilTime({
      localDateTime: targetLocalDateTime,
      timeZone: "Asia/Shanghai",
      precision: "second",
    }),
  );
  return Object.freeze({
    profileRef: Object.freeze({
      profileId: profile.profileId,
      profileVersion: profile.profileVersion,
    }),
    chart: calculateQimenChart(targetTime, SOURCE_REFERENCE),
  });
}

describe("birth profile and target-time chart isolation", () => {
  it("keeps the same target-time Qimen chart identical across different birth profiles", () => {
    const store = createBirthProfileStore();
    const first = store.create({
      profileId: "profile-a",
      originalBirthInput: {
        calendar: "gregorian",
        precision: "minute",
        localDateTime: "1988-04-12T06:45",
        timeZone: "Asia/Shanghai",
        placeText: "浙江省杭州市",
      },
    });
    const second = store.create({
      profileId: "profile-b",
      originalBirthInput: {
        calendar: "gregorian",
        precision: "shichen",
        localDate: "1975-11-03",
        shichenBranch: "卯",
        timeZone: "Asia/Shanghai",
        placeText: "江苏省南京市",
      },
    });
    const target = "2002-08-16T12:00:00";

    const firstResult = calculateForProfile(first, target);
    const secondResult = calculateForProfile(second, target);

    expect(firstResult.profileRef).not.toEqual(secondResult.profileRef);
    expect(chartHash(firstResult.chart)).toBe(chartHash(secondResult.chart));
    expect(firstResult.chart).toEqual(secondResult.chart);
  });

  it("allows target time, not the birth profile, to change the base chart", () => {
    const store = createBirthProfileStore();
    const profile = store.create({
      profileId: "profile-a",
      originalBirthInput: {
        calendar: "gregorian",
        precision: "minute",
        localDateTime: "1988-04-12T06:45",
        timeZone: "Asia/Shanghai",
        placeText: "浙江省杭州市",
      },
    });

    const noon = calculateForProfile(profile, "2002-08-16T12:00:00");
    const afternoon = calculateForProfile(profile, "2002-08-16T14:00:00");

    expect(noon.profileRef).toEqual(afternoon.profileRef);
    expect(chartHash(noon.chart)).not.toBe(chartHash(afternoon.chart));
    expect(noon.chart).not.toEqual(afternoon.chart);
  });
});
