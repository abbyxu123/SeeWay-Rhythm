import { QimenGoldenCaseSchema, type QimenGoldenCase } from "./golden";

export type QimenGoldenReadinessCase = QimenGoldenCase;

export interface QimenGoldenStructureReadiness {
  readonly ready: boolean;
  readonly verifiedCaseCount: number;
  readonly minimumVerifiedCases: 3;
  readonly coveredDunTypes: readonly ("阳遁" | "阴遁")[];
  readonly coveredJu: readonly string[];
  readonly issues: readonly string[];
}

const MINIMUM_VERIFIED_CASES = 3 as const;
const DUN_TYPE_ORDER = Object.freeze(["阳遁", "阴遁"] as const);

function juLabel(goldenCase: QimenGoldenCase): string {
  const numbers = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  return `${goldenCase.chart.dunType}${numbers[goldenCase.chart.juNumber] ?? goldenCase.chart.juNumber}局`;
}

function evidenceSignature(goldenCase: QimenGoldenCase): string {
  const { sourcePath, sourceLocator, sourceSha256 } =
    goldenCase.provenance;
  return `${sourcePath}:${sourceLocator}:${sourceSha256}`;
}

function palaceArrangementSignature(goldenCase: QimenGoldenCase): string {
  return [...goldenCase.chart.palaces]
    .sort((left, right) => left.fixed.number - right.fixed.number)
    .map(({ fixed, earthPlateStem, heavenPlate, gate, deity }) =>
      [
        fixed.number,
        earthPlateStem,
        heavenPlate.map(({ stem, star }) => `${stem}${star}`).join("+"),
        gate ?? "中",
        deity ?? "中",
      ].join(":"),
    )
    .join("|");
}

export function evaluateQimenGoldenStructureReadiness(
  cases: readonly unknown[],
): Readonly<QimenGoldenStructureReadiness> {
  const verifiedCases = cases.flatMap((candidate) => {
    const parsed = QimenGoldenCaseSchema.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });
  const coveredDunTypes = DUN_TYPE_ORDER.filter((dunType) =>
    verifiedCases.some(({ chart }) => chart.dunType === dunType),
  );
  const coveredJu = [...new Set(verifiedCases.map(juLabel))];
  const uniqueEvidence = new Set(verifiedCases.map(evidenceSignature));
  const uniqueArrangements = new Set(
    verifiedCases.map(palaceArrangementSignature),
  );
  const issues: string[] = [];

  if (verifiedCases.length < MINIMUM_VERIFIED_CASES) {
    issues.push("At least three verified palace-complete cases are required.");
  }
  if (coveredDunTypes.length !== DUN_TYPE_ORDER.length) {
    issues.push("Verified cases must cover both Yang Dun and Yin Dun.");
  }
  if (coveredJu.length < MINIMUM_VERIFIED_CASES) {
    issues.push("Verified cases must cover at least three distinct Dun/Ju combinations.");
  }
  if (new Set(verifiedCases.map(({ caseId }) => caseId)).size !== verifiedCases.length) {
    issues.push("Verified case IDs must be unique.");
  }
  if (uniqueEvidence.size !== verifiedCases.length) {
    issues.push("Each verified case must have distinct source evidence.");
  }
  if (uniqueArrangements.size !== verifiedCases.length) {
    issues.push("Each verified case must have a distinct palace arrangement.");
  }

  return Object.freeze({
    ready: issues.length === 0,
    verifiedCaseCount: verifiedCases.length,
    minimumVerifiedCases: MINIMUM_VERIFIED_CASES,
    coveredDunTypes: Object.freeze([...coveredDunTypes]),
    coveredJu: Object.freeze(coveredJu),
    issues: Object.freeze(issues),
  });
}
