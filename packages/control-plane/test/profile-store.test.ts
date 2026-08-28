import {
  BIRTH_PROFILE_CONTRACT_VERSION,
  type BirthProfileDraft,
} from "@seeway/contracts";
import { createBirthProfileStore } from "@seeway/control-plane";
import { describe, expect, it } from "vitest";

function draft(
  profileId: string,
  localDateTime = "1988-04-12T06:45",
): BirthProfileDraft {
  return {
    profileId,
    originalBirthInput: {
      calendar: "gregorian",
      precision: "minute",
      localDateTime,
      timeZone: "Asia/Shanghai",
      placeText: "浙江省杭州市",
    },
  };
}

describe("local versioned birth profile store", () => {
  it("creates version one and returns immutable snapshots", () => {
    const input = draft("profile-a");
    const store = createBirthProfileStore();
    const created = store.create(input);

    expect(created).toEqual({
      contractVersion: BIRTH_PROFILE_CONTRACT_VERSION,
      profileId: "profile-a",
      profileVersion: 1,
      originalBirthInput: input.originalBirthInput,
    });
    expect(Object.isFrozen(created)).toBe(true);
    expect(Object.isFrozen(created.originalBirthInput)).toBe(true);
    expect(store.get("profile-a")).toBe(created);
  });

  it("appends a new immutable version instead of replacing birth data", () => {
    const store = createBirthProfileStore();
    const first = store.create(draft("profile-a"));
    const second = store.revise(
      "profile-a",
      draft("profile-a", "1989-05-13T07:20"),
    );

    expect(second.profileVersion).toBe(2);
    expect(second.originalBirthInput).toMatchObject({
      localDateTime: "1989-05-13T07:20",
    });
    expect(store.get("profile-a")).toBe(second);
    expect(store.get("profile-a", 1)).toBe(first);
    expect(store.get("profile-a", 1)?.originalBirthInput).toMatchObject({
      localDateTime: "1988-04-12T06:45",
    });
    expect(store.listVersions("profile-a")).toEqual([first, second]);
    expect(Object.isFrozen(store.listVersions("profile-a"))).toBe(true);
  });

  it("snapshots caller data and rejects cross-profile or missing revisions", () => {
    const mutable = {
      profileId: "profile-a",
      originalBirthInput: {
        calendar: "gregorian",
        precision: "minute",
        localDateTime: "1988-04-12T06:45",
        timeZone: "Asia/Shanghai",
        placeText: "浙江省杭州市",
      },
    } satisfies BirthProfileDraft;
    const store = createBirthProfileStore();
    const created = store.create(mutable);
    mutable.originalBirthInput.placeText = "被调用者修改";

    expect(created.originalBirthInput.placeText).toBe("浙江省杭州市");
    expect(() => store.create(draft("profile-a"))).toThrow(/already exists/i);
    expect(() => store.revise("missing", draft("missing"))).toThrow(/not found/i);
    expect(() => store.revise("profile-a", draft("profile-b"))).toThrow(
      /profile id/i,
    );
  });

  it("keeps each profile history separate without billing limits", () => {
    const store = createBirthProfileStore();
    for (const profileId of ["profile-a", "profile-b", "profile-c"]) {
      store.create(draft(profileId));
    }

    expect(store.listProfileIds()).toEqual([
      "profile-a",
      "profile-b",
      "profile-c",
    ]);
    expect(Object.isFrozen(store.listProfileIds())).toBe(true);
  });

  it("rejects malformed profile data at the storage boundary", () => {
    const store = createBirthProfileStore();

    expect(() =>
      store.create({
        ...draft("profile-a"),
        originalBirthInput: {
          ...draft("profile-a").originalBirthInput,
          timeZone: "CST",
        },
      }),
    ).toThrow();
  });
});
