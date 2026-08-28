import {
  BIRTH_PROFILE_CONTRACT_VERSION,
  BirthProfileDraftSchema,
  BirthProfileSchema,
} from "@seeway/contracts";
import { describe, expect, it } from "vitest";

const minuteBirthInput = {
  calendar: "gregorian",
  precision: "minute",
  localDateTime: "1988-04-12T06:45",
  timeZone: "Asia/Shanghai",
  placeText: "浙江省杭州市",
} as const;

function profile(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: BIRTH_PROFILE_CONTRACT_VERSION,
    profileId: "profile-example-a",
    profileVersion: 1,
    originalBirthInput: minuteBirthInput,
    displayName: "示例甲",
    sex: "female",
    ...overrides,
  };
}

describe("birth profile contract", () => {
  it("accepts an explicit minute-precision Gregorian birth input", () => {
    const parsed = BirthProfileSchema.parse(profile());

    expect(parsed).toEqual(profile());
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.originalBirthInput)).toBe(true);
  });

  it("accepts an explicit shichen range without inventing a minute", () => {
    const parsed = BirthProfileSchema.parse(
      profile({
        originalBirthInput: {
          calendar: "gregorian",
          precision: "shichen",
          localDate: "1975-11-03",
          shichenBranch: "卯",
          timeZone: "Asia/Shanghai",
          placeText: "江苏省南京市",
        },
        displayName: undefined,
        sex: undefined,
      }),
    );

    expect(parsed.originalBirthInput).toEqual({
      calendar: "gregorian",
      precision: "shichen",
      localDate: "1975-11-03",
      shichenBranch: "卯",
      timeZone: "Asia/Shanghai",
      placeText: "江苏省南京市",
    });
    expect("localDateTime" in parsed.originalBirthInput).toBe(false);
  });

  it("keeps display name and sex optional metadata", () => {
    const { displayName: _displayName, sex: _sex, ...required } = profile();

    expect(BirthProfileSchema.parse(required)).toEqual(required);
    expect(
      BirthProfileDraftSchema.parse({
        profileId: required.profileId,
        originalBirthInput: required.originalBirthInput,
      }),
    ).toEqual({
      profileId: required.profileId,
      originalBirthInput: required.originalBirthInput,
    });
  });

  it.each([
    ["missing timezone", { ...minuteBirthInput, timeZone: undefined }],
    ["ambiguous timezone", { ...minuteBirthInput, timeZone: "CST" }],
    ["invalid timezone", { ...minuteBirthInput, timeZone: "Asia/Nowhere" }],
    ["missing precision", { ...minuteBirthInput, precision: undefined }],
    ["invalid date", { ...minuteBirthInput, localDateTime: "1988-02-30T06:45" }],
    ["offset-bearing time", { ...minuteBirthInput, localDateTime: "1988-04-12T06:45+08:00" }],
    ["second-bearing time", { ...minuteBirthInput, localDateTime: "1988-04-12T06:45:00" }],
    ["blank place", { ...minuteBirthInput, placeText: "   " }],
    ["silently padded place", { ...minuteBirthInput, placeText: " 杭州市" }],
  ])("rejects %s instead of silently defaulting it", (_label, input) => {
    expect(
      BirthProfileSchema.safeParse(
        profile({ originalBirthInput: input }),
      ).success,
    ).toBe(false);
  });

  it("rejects mixed precision fields, invalid versions and unknown fields", () => {
    expect(
      BirthProfileSchema.safeParse(
        profile({
          originalBirthInput: {
            ...minuteBirthInput,
            localDate: "1988-04-12",
            shichenBranch: "卯",
          },
        }),
      ).success,
    ).toBe(false);
    expect(BirthProfileSchema.safeParse(profile({ profileVersion: 0 })).success)
      .toBe(false);
    expect(BirthProfileSchema.safeParse(profile({ billingTier: "free" })).success)
      .toBe(false);
  });
});
