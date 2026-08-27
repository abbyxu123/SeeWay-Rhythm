import {
  buildEarthPlate,
  calculateQimenHourFacts,
  determineQimenBureau,
} from "@seeway/qimen-core";
import {
  calculateQimenRotationAnchors,
  rotateDeities,
  rotateGates,
  rotateHeavenPlate,
} from "../src/rotation";
import {
  buildTimeContext,
  resolveCivilTime,
} from "@seeway/time-core";
import { describe, expect, it } from "vitest";

function baseAt(localDateTime: string) {
  const timeContext = buildTimeContext(
    resolveCivilTime({
      localDateTime,
      timeZone: "Asia/Shanghai",
      precision: "second",
    }),
  );
  const bureau = determineQimenBureau(timeContext);

  return {
    bureau,
    earthPlate: buildEarthPlate(bureau),
    hourFacts: calculateQimenHourFacts(timeContext.pillars.hour),
  };
}

describe("Qimen rotation anchors", () => {
  it("derives the chief star, chief gate and targets from the hidden instrument", () => {
    const { bureau, earthPlate, hourFacts } = baseAt(
      "1997-03-19T21:15:00",
    );

    expect(
      calculateQimenRotationAnchors(
        earthPlate,
        hourFacts,
        bureau.dunType,
      ),
    ).toEqual({
      xunInstrumentPalace: 6,
      rotationSourcePalace: 6,
      starTargetPalace: 1,
      gateTargetPalace: 9,
      chiefStar: "天心",
      chiefGate: "开门",
    });
  });

  it("lodges a center-palace chief star and gate in Kun 2", () => {
    const { bureau, earthPlate } = baseAt("1997-03-19T21:15:00");
    const hourFacts = calculateQimenHourFacts("甲戌");

    expect(
      calculateQimenRotationAnchors(
        earthPlate,
        hourFacts,
        bureau.dunType,
      ),
    ).toEqual({
      xunInstrumentPalace: 5,
      rotationSourcePalace: 2,
      starTargetPalace: 2,
      gateTargetPalace: 2,
      chiefStar: "天禽",
      chiefGate: "死门",
    });
  });

  it("counts a Yang center-origin gate from raw palace 5 before lodging", () => {
    const { bureau, earthPlate } = baseAt("1997-03-19T21:15:00");
    const hourFacts = calculateQimenHourFacts("乙亥");

    expect(
      calculateQimenRotationAnchors(
        earthPlate,
        hourFacts,
        bureau.dunType,
      ),
    ).toEqual({
      xunInstrumentPalace: 5,
      rotationSourcePalace: 2,
      starTargetPalace: 3,
      gateTargetPalace: 6,
      chiefStar: "天禽",
      chiefGate: "死门",
    });
  });

  it("lodges a center star target while keeping gate counting independent", () => {
    const { bureau, earthPlate, hourFacts } = baseAt(
      "2001-06-11T13:20:00",
    );

    expect(
      calculateQimenRotationAnchors(
        earthPlate,
        hourFacts,
        bureau.dunType,
      ),
    ).toEqual({
      xunInstrumentPalace: 1,
      rotationSourcePalace: 1,
      starTargetPalace: 2,
      gateTargetPalace: 1,
      chiefStar: "天蓬",
      chiefGate: "休门",
    });
  });
});

describe("Yang Dun rotation", () => {
  it("rotates heaven-plate stems and nine stars together", () => {
    const base = baseAt("1997-03-19T21:15:00");
    const anchors = calculateQimenRotationAnchors(
      base.earthPlate,
      base.hourFacts,
      base.bureau.dunType,
    );

    expect(rotateHeavenPlate(base.earthPlate, anchors)).toEqual([
      { palaceNumber: 1, heavenPlate: [{ stem: "庚", star: "天心" }] },
      { palaceNumber: 2, heavenPlate: [{ stem: "癸", star: "天英" }] },
      { palaceNumber: 3, heavenPlate: [{ stem: "壬", star: "天任" }] },
      { palaceNumber: 4, heavenPlate: [{ stem: "乙", star: "天冲" }] },
      { palaceNumber: 5, heavenPlate: [] },
      { palaceNumber: 6, heavenPlate: [{ stem: "辛", star: "天柱" }] },
      {
        palaceNumber: 7,
        heavenPlate: [
          { stem: "己", star: "天禽" },
          { stem: "丙", star: "天芮" },
        ],
      },
      { palaceNumber: 8, heavenPlate: [{ stem: "丁", star: "天蓬" }] },
      { palaceNumber: 9, heavenPlate: [{ stem: "戊", star: "天辅" }] },
    ]);
  });

  it("rotates all eight gates from the chief-gate target", () => {
    const base = baseAt("1997-03-19T21:15:00");
    const anchors = calculateQimenRotationAnchors(
      base.earthPlate,
      base.hourFacts,
      base.bureau.dunType,
    );

    expect(rotateGates(anchors)).toEqual([
      { palaceNumber: 1, gate: "杜门" },
      { palaceNumber: 2, gate: "休门" },
      { palaceNumber: 3, gate: "死门" },
      { palaceNumber: 4, gate: "惊门" },
      { palaceNumber: 5, gate: null },
      { palaceNumber: 6, gate: "伤门" },
      { palaceNumber: 7, gate: "生门" },
      { palaceNumber: 8, gate: "景门" },
      { palaceNumber: 9, gate: "开门" },
    ]);
  });

  it("places the eight deities forward from the chief-star target", () => {
    const base = baseAt("1997-03-19T21:15:00");
    const anchors = calculateQimenRotationAnchors(
      base.earthPlate,
      base.hourFacts,
      base.bureau.dunType,
    );

    expect(rotateDeities(anchors, "阳遁")).toEqual([
      { palaceNumber: 1, deity: "值符" },
      { palaceNumber: 2, deity: "玄武" },
      { palaceNumber: 3, deity: "太阴" },
      { palaceNumber: 4, deity: "六合" },
      { palaceNumber: 5, deity: null },
      { palaceNumber: 6, deity: "九天" },
      { palaceNumber: 7, deity: "九地" },
      { palaceNumber: 8, deity: "腾蛇" },
      { palaceNumber: 9, deity: "白虎" },
    ]);
  });
});

describe("Yin Dun rotation", () => {
  const base = baseAt("2002-08-16T12:00:00");

  it("counts a Yin center-origin gate backward from raw palace 5", () => {
    const hourFacts = calculateQimenHourFacts("乙丑");

    expect(
      calculateQimenRotationAnchors(
        base.earthPlate,
        hourFacts,
        base.bureau.dunType,
      ),
    ).toEqual({
      xunInstrumentPalace: 5,
      rotationSourcePalace: 2,
      starTargetPalace: 6,
      gateTargetPalace: 4,
      chiefStar: "天禽",
      chiefGate: "死门",
    });
  });

  it("preserves the Fu Yin heaven plate and gates", () => {
    const anchors = calculateQimenRotationAnchors(
      base.earthPlate,
      base.hourFacts,
      base.bureau.dunType,
    );

    expect(rotateHeavenPlate(base.earthPlate, anchors)).toEqual([
      { palaceNumber: 1, heavenPlate: [{ stem: "壬", star: "天蓬" }] },
      {
        palaceNumber: 2,
        heavenPlate: [
          { stem: "戊", star: "天禽" },
          { stem: "辛", star: "天芮" },
        ],
      },
      { palaceNumber: 3, heavenPlate: [{ stem: "庚", star: "天冲" }] },
      { palaceNumber: 4, heavenPlate: [{ stem: "己", star: "天辅" }] },
      { palaceNumber: 5, heavenPlate: [] },
      { palaceNumber: 6, heavenPlate: [{ stem: "乙", star: "天心" }] },
      { palaceNumber: 7, heavenPlate: [{ stem: "丙", star: "天柱" }] },
      { palaceNumber: 8, heavenPlate: [{ stem: "丁", star: "天任" }] },
      { palaceNumber: 9, heavenPlate: [{ stem: "癸", star: "天英" }] },
    ]);
    expect(rotateGates(anchors)).toEqual([
      { palaceNumber: 1, gate: "休门" },
      { palaceNumber: 2, gate: "死门" },
      { palaceNumber: 3, gate: "伤门" },
      { palaceNumber: 4, gate: "杜门" },
      { palaceNumber: 5, gate: null },
      { palaceNumber: 6, gate: "开门" },
      { palaceNumber: 7, gate: "惊门" },
      { palaceNumber: 8, gate: "生门" },
      { palaceNumber: 9, gate: "景门" },
    ]);
  });

  it("places the eight deities backward in Yin Dun", () => {
    const anchors = calculateQimenRotationAnchors(
      base.earthPlate,
      base.hourFacts,
      base.bureau.dunType,
    );

    expect(rotateDeities(anchors, "阴遁")).toEqual([
      { palaceNumber: 1, deity: "玄武" },
      { palaceNumber: 2, deity: "值符" },
      { palaceNumber: 3, deity: "六合" },
      { palaceNumber: 4, deity: "太阴" },
      { palaceNumber: 5, deity: null },
      { palaceNumber: 6, deity: "九地" },
      { palaceNumber: 7, deity: "九天" },
      { palaceNumber: 8, deity: "白虎" },
      { palaceNumber: 9, deity: "腾蛇" },
    ]);
  });

  it("rotates a non-Fu-Yin Yin chart without reversing stars or gates", () => {
    const hourFacts = calculateQimenHourFacts("丁酉");
    const anchors = calculateQimenRotationAnchors(
      base.earthPlate,
      hourFacts,
      base.bureau.dunType,
    );

    expect(anchors).toMatchObject({
      rotationSourcePalace: 2,
      starTargetPalace: 8,
      gateTargetPalace: 8,
      chiefStar: "天芮",
      chiefGate: "死门",
    });
    expect(rotateHeavenPlate(base.earthPlate, anchors)).toEqual([
      { palaceNumber: 1, heavenPlate: [{ stem: "癸", star: "天英" }] },
      { palaceNumber: 2, heavenPlate: [{ stem: "丁", star: "天任" }] },
      { palaceNumber: 3, heavenPlate: [{ stem: "丙", star: "天柱" }] },
      { palaceNumber: 4, heavenPlate: [{ stem: "乙", star: "天心" }] },
      { palaceNumber: 5, heavenPlate: [] },
      { palaceNumber: 6, heavenPlate: [{ stem: "己", star: "天辅" }] },
      { palaceNumber: 7, heavenPlate: [{ stem: "庚", star: "天冲" }] },
      {
        palaceNumber: 8,
        heavenPlate: [
          { stem: "戊", star: "天禽" },
          { stem: "辛", star: "天芮" },
        ],
      },
      { palaceNumber: 9, heavenPlate: [{ stem: "壬", star: "天蓬" }] },
    ]);
    expect(rotateGates(anchors)).toEqual([
      { palaceNumber: 1, gate: "景门" },
      { palaceNumber: 2, gate: "生门" },
      { palaceNumber: 3, gate: "惊门" },
      { palaceNumber: 4, gate: "开门" },
      { palaceNumber: 5, gate: null },
      { palaceNumber: 6, gate: "杜门" },
      { palaceNumber: 7, gate: "伤门" },
      { palaceNumber: 8, gate: "死门" },
      { palaceNumber: 9, gate: "休门" },
    ]);
    expect(rotateDeities(anchors, "阴遁")).toEqual([
      { palaceNumber: 1, deity: "腾蛇" },
      { palaceNumber: 2, deity: "白虎" },
      { palaceNumber: 3, deity: "九天" },
      { palaceNumber: 4, deity: "九地" },
      { palaceNumber: 5, deity: null },
      { palaceNumber: 6, deity: "太阴" },
      { palaceNumber: 7, deity: "六合" },
      { palaceNumber: 8, deity: "值符" },
      { palaceNumber: 9, deity: "玄武" },
    ]);
  });
});
