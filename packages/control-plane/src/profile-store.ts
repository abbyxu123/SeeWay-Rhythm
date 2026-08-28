import {
  BIRTH_PROFILE_CONTRACT_VERSION,
  BirthProfileDraftSchema,
  BirthProfileSchema,
  type BirthProfile,
  type BirthProfileDraft,
} from "@seeway/contracts";

export interface BirthProfileStore {
  readonly create: (draft: BirthProfileDraft) => BirthProfile;
  readonly revise: (
    profileId: string,
    draft: BirthProfileDraft,
  ) => BirthProfile;
  readonly get: (
    profileId: string,
    profileVersion?: number,
  ) => BirthProfile | undefined;
  readonly listVersions: (profileId: string) => readonly BirthProfile[];
  readonly listProfileIds: () => readonly string[];
}

function buildProfile(
  draftInput: BirthProfileDraft,
  profileVersion: number,
): BirthProfile {
  const draft = BirthProfileDraftSchema.parse(draftInput);
  return BirthProfileSchema.parse({
    contractVersion: BIRTH_PROFILE_CONTRACT_VERSION,
    ...draft,
    profileVersion,
  });
}

export function createBirthProfileStore(): Readonly<BirthProfileStore> {
  const histories = new Map<string, BirthProfile[]>();

  function create(draftInput: BirthProfileDraft): BirthProfile {
    const draft = BirthProfileDraftSchema.parse(draftInput);
    if (histories.has(draft.profileId)) {
      throw new Error(`Birth profile ${draft.profileId} already exists.`);
    }
    const profile = buildProfile(draft, 1);
    histories.set(draft.profileId, [profile]);
    return profile;
  }

  function revise(
    profileId: string,
    draftInput: BirthProfileDraft,
  ): BirthProfile {
    const history = histories.get(profileId);
    if (!history) {
      throw new Error(`Birth profile ${profileId} was not found.`);
    }
    const draft = BirthProfileDraftSchema.parse(draftInput);
    if (draft.profileId !== profileId) {
      throw new Error("Revision profile ID must match the stored profile ID.");
    }
    const profile = buildProfile(draft, history.length + 1);
    history.push(profile);
    return profile;
  }

  function get(
    profileId: string,
    profileVersion?: number,
  ): BirthProfile | undefined {
    const history = histories.get(profileId);
    if (!history) {
      return undefined;
    }
    if (profileVersion === undefined) {
      return history.at(-1);
    }
    if (!Number.isInteger(profileVersion) || profileVersion < 1) {
      return undefined;
    }
    return history[profileVersion - 1];
  }

  function listVersions(profileId: string): readonly BirthProfile[] {
    return Object.freeze([...(histories.get(profileId) ?? [])]);
  }

  function listProfileIds(): readonly string[] {
    return Object.freeze([...histories.keys()]);
  }

  return Object.freeze({
    create,
    revise,
    get,
    listVersions,
    listProfileIds,
  });
}
