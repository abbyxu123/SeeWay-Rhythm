import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Temporal } from "@js-temporal/polyfill";
import {
  buildTimeContext,
  resolveCivilTime,
  sexagenaryName,
} from "@seeway/time-core";
import { describe, expect, test } from "vitest";
import { z } from "zod";

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(TEST_DIRECTORY, "..");
const FIXTURE_DIRECTORY = resolve(TEST_DIRECTORY, "fixtures/time-core");

const PrecisionSchema = z.enum(["minute", "second"]);
const StatusSchema = z.enum([
  "verified",
  "boundary_review",
  "unverified_rule",
  "blocked",
]);
const SexagenaryNameSchema = z.string().refine(
  (value) =>
    new Set(
      Array.from({ length: 60 }, (_, index) => sexagenaryName(index)),
    ).has(value),
  "Pillar must be one of the sixty canonical sexagenary names.",
);

const PlainLocalDateTimeSchema = z.string().superRefine((value, context) => {
  try {
    if (Temporal.PlainDateTime.from(value).toString() !== value) {
      throw new RangeError("Local date-time is not canonical.");
    }
  } catch {
    context.addIssue({
      code: "custom",
      message: "Expected a canonical plain local date-time.",
    });
  }
});

const InstantSchema = z.string().superRefine((value, context) => {
  try {
    if (Temporal.Instant.from(value).toString() !== value) {
      throw new RangeError("Instant is not canonical.");
    }
  } catch {
    context.addIssue({
      code: "custom",
      message: "Expected a canonical UTC instant.",
    });
  }
});

const ZonedDateTimeSchema = z.string().superRefine((value, context) => {
  try {
    if (Temporal.ZonedDateTime.from(value).toString() !== value) {
      throw new RangeError("Zoned date-time is not canonical.");
    }
  } catch {
    context.addIssue({
      code: "custom",
      message: "Expected a canonical zoned date-time.",
    });
  }
});

const VerificationDateSchema = z.string().superRefine((value, context) => {
  try {
    if (Temporal.PlainDate.from(value).toString() !== value) {
      throw new RangeError("Verification date is not canonical.");
    }
  } catch {
    context.addIssue({
      code: "custom",
      message: "Expected a valid ISO verification date.",
    });
  }
});

const SourceIdSchema = z.enum([
  "zhang-course-notes",
  "hko-almanac",
  "ccdi-shichen-article",
  "tyme4ts",
]);
const SourceClassificationSchema = z.enum([
  "official_publication",
  "user_provided_reference",
  "provider_candidate",
]);
const SourceIndependenceSchema = z.enum(["independent", "provider_only"]);
type SourceId = z.infer<typeof SourceIdSchema>;

interface SourcePolicy {
  readonly classification: z.infer<typeof SourceClassificationSchema>;
  readonly independence: z.infer<typeof SourceIndependenceSchema>;
  readonly canonicalSourceName: string;
  readonly allowedExpectedLeaves: readonly string[];
  readonly locatorMatches: (value: string) => boolean;
  readonly requiredStatus?: z.infer<typeof StatusSchema>;
  readonly requiredArtifactSha256?: string;
}

const ZHANG_LOCATOR_PATTERN =
  /^reference materials\/张志春课程\/河北周易研究会奇门遁甲高级班笔记\.pdf，PDF第[1-9]\d*页$/;
const CCDI_ARTICLE_URL =
  "https://www.ccdi.gov.cn/lswhn/wenhua/wenyuan/201907/t20190719_27179.html";
const HKO_ALLOWED_PATHS = new Set([
  "/tc/gts/astron2026/files/HKO_almanac_2026.pdf",
  "/tc/gts/astron2026/files/2026SolarTerms24.pdf",
  "/en/gts/astronomy/Solar_Term.htm",
]);
const TYME_LOCATOR_PATTERN =
  /^https:\/\/www\.hko\.gov\.hk\/tc\/gts\/astron2026\/files\/2026SolarTerms24\.pdf，[^；]+；tyme4ts@1\.5\.2候选\d{2}:\d{2}:\d{2}$/;

function isHkoLocator(value: string): boolean {
  const segments = value.split("；");
  return (
    segments.length > 0 &&
    segments.every((segment) => {
      const [rawUrl, ...annotations] = segment.split("，");
      if (!rawUrl || annotations.some((annotation) => annotation.length === 0)) {
        return false;
      }

      try {
        const parsed = new URL(rawUrl);
        return (
          parsed.protocol === "https:" &&
          parsed.hostname === "www.hko.gov.hk" &&
          parsed.username === "" &&
          parsed.password === "" &&
          parsed.port === "" &&
          parsed.search === "" &&
          parsed.hash === "" &&
          HKO_ALLOWED_PATHS.has(parsed.pathname)
        );
      } catch {
        return false;
      }
    })
  );
}

function isCcdiLocator(value: string): boolean {
  return (
    value === CCDI_ARTICLE_URL ||
    (value.startsWith(`${CCDI_ARTICLE_URL}，`) && !value.includes("；"))
  );
}

const SOURCE_POLICIES: Readonly<Record<SourceId, Readonly<SourcePolicy>>> =
  Object.freeze({
  "zhang-course-notes": Object.freeze({
    classification: "user_provided_reference",
    independence: "independent",
    canonicalSourceName: "河北周易研究会奇门遁甲高级班笔记",
    allowedExpectedLeaves: Object.freeze([
      "pillars.year",
      "pillars.month",
      "pillars.day",
      "pillars.hour",
    ]),
    locatorMatches: (value: string) => ZHANG_LOCATOR_PATTERN.test(value),
    requiredArtifactSha256:
      "4ee9788e2fcc577a66c5aef83a50f353b01e2dec50915fa799c8b7473fecbc47",
  }),
  "hko-almanac": Object.freeze({
    classification: "official_publication",
    independence: "independent",
    canonicalSourceName: "香港天文台2026年历书及二十四节气资料",
    allowedExpectedLeaves: Object.freeze([
      "lunar.month",
      "lunar.day",
      "lunar.monthName",
      "lunar.dayName",
      "pillars.day",
      "solarTerms.previous.name",
      "solarTerms.current.name",
      "solarTerms.next.name",
    ]),
    locatorMatches: isHkoLocator,
  }),
  "ccdi-shichen-article": Object.freeze({
    classification: "official_publication",
    independence: "independent",
    canonicalSourceName: "中央纪委国家监委网站十二时辰说明",
    allowedExpectedLeaves: Object.freeze(["shichen.branch"]),
    locatorMatches: isCcdiLocator,
  }),
  tyme4ts: Object.freeze({
    classification: "provider_candidate",
    independence: "provider_only",
    canonicalSourceName: "香港天文台分钟值旁证与tyme4ts秒级候选值",
    allowedExpectedLeaves: Object.freeze([
      "solarTerms.previous.name",
      "solarTerms.previous.localDateTime",
      "solarTerms.previous.instant",
      "solarTerms.current.name",
      "solarTerms.current.localDateTime",
      "solarTerms.current.instant",
      "solarTerms.next.name",
      "solarTerms.next.localDateTime",
      "solarTerms.next.instant",
    ]),
    locatorMatches: (value: string) => TYME_LOCATOR_PATTERN.test(value),
    requiredStatus: "boundary_review",
  }),
  });

const RESERVED_PROVIDER_SOURCE_NAMES = new Set([
  "tyme4ts",
  "tyme4ts@1.5.2",
  "tyme4ts@1.5.2 candidate output",
]);
const ZHANG_ARTIFACT_SHA256 =
  "4ee9788e2fcc577a66c5aef83a50f353b01e2dec50915fa799c8b7473fecbc47";

const SourceLocatorSchema = z.string().trim().min(1).superRefine(
  (value, context) => {
    const isRepositoryRelative = value.startsWith("reference materials/");
    const isHttps = value.startsWith("https://");
    const hasAbsoluteOrTraversalPath =
      value.startsWith("/") ||
      /^[A-Za-z]:[\\/]/.test(value) ||
      value.startsWith("file:") ||
      value.includes("\\") ||
      value.split("/").includes("..");

    if ((!isRepositoryRelative && !isHttps) || hasAbsoluteOrTraversalPath) {
      context.addIssue({
        code: "custom",
        message:
          "Source locator must be HTTPS or a portable repository-relative reference materials path.",
      });
    }
  },
);
const SourceArtifactSha256Schema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, "Expected a lowercase SHA-256 digest.");

const InputSchema = z
  .object({
    localDateTime: z.string().min(1),
    timeZone: z.literal("Asia/Shanghai"),
    precision: PrecisionSchema,
  })
  .strict()
  .superRefine((value, context) => {
    try {
      resolveCivilTime(value);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message:
          error instanceof Error
            ? `Invalid civil input: ${error.message}`
            : "Invalid civil input.",
      });
    }
  });

function nonEmptyPartial<T extends z.ZodRawShape>(shape: T) {
  return z
    .object(shape)
    .partial()
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
      message: "Expected fact groups must contain at least one asserted fact.",
    });
}

const CivilExpectedSchema = nonEmptyPartial({
  localDateTime: PlainLocalDateTimeSchema,
  timeZone: z.literal("Asia/Shanghai"),
  offset: z.string().min(1),
  instant: InstantSchema,
  precision: PrecisionSchema,
  conventionVersion: z.literal("time-cn-zhang-v1"),
});

const ShichenExpectedSchema = nonEmptyPartial({
  branch: z.enum([
    "子",
    "丑",
    "寅",
    "卯",
    "辰",
    "巳",
    "午",
    "未",
    "申",
    "酉",
    "戌",
    "亥",
  ]),
  index: z.number().int().min(0).max(11),
  startLocal: ZonedDateTimeSchema,
  endLocal: ZonedDateTimeSchema,
  startInstant: InstantSchema,
  endInstant: InstantSchema,
});

const DateBoundaryExpectedSchema = nonEmptyPartial({
  lunarDatePolicy: z.literal("civil-midnight"),
  sexagenaryDayPillarPolicy: z.literal("zi-start-23:00"),
  isSplitWindow: z.boolean(),
});

const LunarExpectedSchema = nonEmptyPartial({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(30),
  leap: z.boolean(),
  yearName: z.string().min(1),
  monthName: z.string().min(1),
  dayName: z.string().min(1),
});

const PillarsExpectedSchema = nonEmptyPartial({
  year: SexagenaryNameSchema,
  month: SexagenaryNameSchema,
  day: SexagenaryNameSchema,
  hour: SexagenaryNameSchema,
});

const SolarTermExpectedSchema = nonEmptyPartial({
  name: z.string().min(1),
  kind: z.enum(["jie", "qi"]),
  localDateTime: ZonedDateTimeSchema,
  instant: InstantSchema,
});

const SolarTermsExpectedSchema = nonEmptyPartial({
  previous: SolarTermExpectedSchema,
  current: SolarTermExpectedSchema,
  next: SolarTermExpectedSchema,
});

const ExpectedSchema = z
  .object({
    civil: CivilExpectedSchema.optional(),
    shichen: ShichenExpectedSchema.optional(),
    dateBoundary: DateBoundaryExpectedSchema.optional(),
    lunar: LunarExpectedSchema.optional(),
    pillars: PillarsExpectedSchema.optional(),
    solarTerms: SolarTermsExpectedSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "A fixture must assert at least one intermediate fact.",
  });

const FixtureCaseObjectSchema = z
  .object({
    id: z.string().trim().min(1),
    input: InputSchema,
    expected: ExpectedSchema,
    sourceId: SourceIdSchema,
    sourceClassification: SourceClassificationSchema,
    sourceIndependence: SourceIndependenceSchema,
    sourceName: z.string().trim().min(1),
    sourceLocator: SourceLocatorSchema,
    sourceArtifactSha256: SourceArtifactSha256Schema.optional(),
    verifier: z.string().trim().min(1),
    verificationDate: VerificationDateSchema,
    status: StatusSchema,
    notes: z.string().trim().min(1),
  })
  .strict();

function validateSourcePolicy(
  value: z.infer<typeof FixtureCaseObjectSchema>,
  context: z.RefinementCtx,
): void {
  const policy = SOURCE_POLICIES[value.sourceId];
  if (
    value.sourceClassification !== policy.classification ||
    value.sourceIndependence !== policy.independence
  ) {
    context.addIssue({
      code: "custom",
      message: `Source policy mismatch for ${value.sourceId}.`,
      path: ["sourceId"],
    });
  }

  if (value.sourceName !== policy.canonicalSourceName) {
    context.addIssue({
      code: "custom",
      message: `Source name must match the canonical identity for ${value.sourceId}.`,
      path: ["sourceName"],
    });
  }

  if (!policy.locatorMatches(value.sourceLocator)) {
    context.addIssue({
      code: "custom",
      message: `Source locator does not match the policy for ${value.sourceId}.`,
      path: ["sourceLocator"],
    });
  }

  if (policy.requiredStatus && value.status !== policy.requiredStatus) {
    context.addIssue({
      code: "custom",
      message: `${value.sourceId} fixtures require status ${policy.requiredStatus}.`,
      path: ["status"],
    });
  }

  if (
    policy.requiredArtifactSha256 &&
    value.sourceArtifactSha256 !== policy.requiredArtifactSha256
  ) {
    context.addIssue({
      code: "custom",
      message: `${value.sourceId} requires its pinned source artifact SHA-256.`,
      path: ["sourceArtifactSha256"],
    });
  }

  const allowedLeaves = new Set(policy.allowedExpectedLeaves);
  for (const leafPath of collectLeafPaths(value.expected)) {
    if (!allowedLeaves.has(leafPath)) {
      context.addIssue({
        code: "custom",
        message: `${value.sourceId} cannot prove expected field ${leafPath}.`,
        path: ["expected", ...leafPath.split(".")],
      });
    }
  }
}

function collectLeafPaths(
  value: Readonly<Record<string, unknown>>,
  prefix = "",
): string[] {
  const paths: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix.length > 0 ? `${prefix}.${key}` : key;
    if (
      typeof child === "object" &&
      child !== null &&
      !Array.isArray(child)
    ) {
      paths.push(
        ...collectLeafPaths(child as Readonly<Record<string, unknown>>, path),
      );
    } else {
      paths.push(path);
    }
  }
  return paths;
}

const FixtureCaseSchema = FixtureCaseObjectSchema.superRefine(
  validateSourcePolicy,
);

const FixtureFileSchema = z
  .object({
    schemaVersion: z.literal("time-golden-v1"),
    cases: z.array(FixtureCaseSchema).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.cases.forEach((fixture, index) => {
      if (seen.has(fixture.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate fixture id: ${fixture.id}`,
          path: ["cases", index, "id"],
        });
      }
      seen.add(fixture.id);
    });
  });

const FixtureCorpusSchema = z
  .tuple([FixtureFileSchema, FixtureFileSchema])
  .superRefine((files, context) => {
    const seen = new Map<string, number>();
    files.forEach((file, fileIndex) => {
      file.cases.forEach((fixture, caseIndex) => {
        const previousFileIndex = seen.get(fixture.id);
        if (previousFileIndex !== undefined) {
          context.addIssue({
            code: "custom",
            message: `Fixture id ${fixture.id} is duplicated across files ${previousFileIndex} and ${fileIndex}.`,
            path: [fileIndex, "cases", caseIndex, "id"],
          });
        } else {
          seen.set(fixture.id, fileIndex);
        }
      });
    });
  });

const ProductionEligibleFixtureSchema = FixtureCaseObjectSchema.extend({
  status: z.literal("verified"),
})
  .superRefine(validateSourcePolicy)
  .superRefine((value, context) => {
    if (
      value.sourceIndependence !== "independent" ||
      value.sourceClassification === "provider_candidate" ||
      value.sourceId === "tyme4ts" ||
      RESERVED_PROVIDER_SOURCE_NAMES.has(value.sourceName)
    ) {
      context.addIssue({
        code: "custom",
        message: "Production fixtures require registered independent evidence.",
        path: ["sourceId"],
      });
    }
  });

const RootPackageDependencySchema = z
  .object({
    devDependencies: z
      .object({
        "@js-temporal/polyfill": z.literal("0.5.1"),
        zod: z.literal("4.1.5"),
      })
      .passthrough(),
  })
  .passthrough();

function readFixtureFile(name: string): unknown {
  try {
    const json: unknown = JSON.parse(
      readFileSync(resolve(FIXTURE_DIRECTORY, name), "utf8"),
    );
    return json;
  } catch (error) {
    return {
      fixtureLoadError: error instanceof Error ? error.message : String(error),
    };
  }
}

const normalRaw = readFixtureFile("normal-cases.json");
const boundaryRaw = readFixtureFile("boundary-cases.json");
const normalResult = FixtureFileSchema.safeParse(normalRaw);
const boundaryResult = FixtureFileSchema.safeParse(boundaryRaw);
const corpusResult = FixtureCorpusSchema.safeParse([normalRaw, boundaryRaw]);
const normalCases = corpusResult.success ? corpusResult.data[0].cases : [];
const boundaryCases = corpusResult.success ? corpusResult.data[1].cases : [];
const allCases = [...normalCases, ...boundaryCases];

const validGateProbe = {
  id: "gate-probe",
  input: {
    localDateTime: "2026-08-21T11:54:00",
    timeZone: "Asia/Shanghai",
    precision: "second",
  },
  expected: { pillars: { day: "丁卯" } },
  sourceId: "hko-almanac",
  sourceClassification: "official_publication",
  sourceIndependence: "independent",
  sourceName: "香港天文台2026年历书及二十四节气资料",
  sourceLocator:
    "https://www.hko.gov.hk/tc/gts/astron2026/files/HKO_almanac_2026.pdf，2026年8月21日",
  verifier: "Manual reviewer",
  verificationDate: "2026-08-22",
  status: "verified",
  notes: "Gate behavior probe.",
};

describe("time-core golden fixture contract", () => {
  test("root package pins direct golden-test runtime dependencies", () => {
    const rootPackage: unknown = JSON.parse(
      readFileSync(resolve(REPOSITORY_ROOT, "package.json"), "utf8"),
    );

    expect(RootPackageDependencySchema.safeParse(rootPackage).success).toBe(
      true,
    );
  });

  test("normal fixture file passes strict runtime validation", () => {
    expect(normalResult.success).toBe(true);
  });

  test("boundary fixture file passes strict runtime validation", () => {
    expect(boundaryResult.success).toBe(true);
    expect(corpusResult.success).toBe(true);
  });

  test("fixture coverage includes ordinary, shichen, and exact term cases", () => {
    expect(normalCases.length).toBeGreaterThanOrEqual(1);
    expect(
      boundaryCases.map((fixture) => fixture.input.localDateTime),
    ).toEqual(
      expect.arrayContaining([
        "2026-08-21T22:59:00",
        "2026-08-21T23:00:00",
        "2026-08-22T00:00:00",
        "2026-08-22T01:00:00",
        "2026-08-07T19:42:42",
        "2026-08-07T19:42:43",
        "2026-08-07T19:42:44",
      ]),
    );
  });

  test("second-level term candidates do not assert unsupported pillar facts", () => {
    const secondLevelTermCases = boundaryCases.filter((fixture) =>
      fixture.id.startsWith("term-liqiu-2026-"),
    );

    expect(secondLevelTermCases).toHaveLength(3);
    expect(
      secondLevelTermCases.map((fixture) =>
        Object.hasOwn(fixture.expected, "pillars"),
      ),
    ).toEqual([false, false, false]);
  });

  test.each(["boundary_review", "unverified_rule", "blocked"])(
    "production gate rejects %s cases",
    (status) => {
      expect(
        ProductionEligibleFixtureSchema.safeParse({
          ...validGateProbe,
          status,
        }).success,
      ).toBe(false);
    },
  );

  test("production gate rejects malformed or missing provenance", () => {
    const { sourceName: _omitted, ...missingSource } = validGateProbe;

    expect(
      ProductionEligibleFixtureSchema.safeParse(missingSource).success,
    ).toBe(false);
    expect(
      ProductionEligibleFixtureSchema.safeParse({
        ...validGateProbe,
        expected: { finalCopy: "looks plausible" },
      }).success,
    ).toBe(false);
    expect(
      ProductionEligibleFixtureSchema.safeParse({
        ...validGateProbe,
        unsupportedField: true,
      }).success,
    ).toBe(false);
  });

  test("fixture schema rejects semantically invalid time and calendar facts", () => {
    const invalidCandidates: unknown[] = [
      {
        ...validGateProbe,
        input: {
          ...validGateProbe.input,
          localDateTime: "2026-02-30T11:54:00",
        },
      },
      {
        ...validGateProbe,
        input: {
          ...validGateProbe.input,
          timeZone: "Mars/Olympus",
        },
      },
      {
        ...validGateProbe,
        expected: {
          civil: {
            localDateTime: "not-a-local-date-time",
            instant: "not-an-instant",
          },
        },
      },
      {
        ...validGateProbe,
        expected: { pillars: { day: "甲丑" } },
      },
      {
        ...validGateProbe,
        verificationDate: "2026-99-99",
      },
    ];

    expect(
      invalidCandidates.map(
        (candidate) => FixtureCaseSchema.safeParse(candidate).success,
      ),
    ).toEqual([false, false, false, false, false]);
  });

  test("source policy separates independent evidence from provider candidates", () => {
    const independentSource = {
      ...validGateProbe,
      sourceId: "hko-almanac",
      sourceClassification: "official_publication",
      sourceIndependence: "independent",
    };
    const providerCandidate = {
      ...validGateProbe,
      sourceId: "tyme4ts",
      sourceClassification: "provider_candidate",
      sourceIndependence: "provider_only",
      sourceName: "香港天文台分钟值旁证与tyme4ts秒级候选值",
      sourceLocator:
        "https://www.hko.gov.hk/tc/gts/astron2026/files/2026SolarTerms24.pdf，立秋2026-08-07 19:43；tyme4ts@1.5.2候选19:42:43",
      status: "boundary_review",
      expected: {
        solarTerms: {
          current: {
            name: "立秋",
            localDateTime: "2026-08-07T19:42:43+08:00[Asia/Shanghai]",
            instant: "2026-08-07T11:42:43Z",
          },
        },
      },
    };
    const disguisedProvider = {
      ...validGateProbe,
      sourceId: "tyme4ts",
      sourceClassification: "official_publication",
      sourceIndependence: "independent",
      sourceName: "tyme4ts@1.5.2",
    };

    expect([
      FixtureCaseSchema.safeParse(independentSource).success,
      ProductionEligibleFixtureSchema.safeParse(independentSource).success,
      FixtureCaseSchema.safeParse(providerCandidate).success,
      ProductionEligibleFixtureSchema.safeParse(providerCandidate).success,
      FixtureCaseSchema.safeParse(disguisedProvider).success,
      ProductionEligibleFixtureSchema.safeParse(disguisedProvider).success,
    ]).toEqual([true, true, true, false, false, false]);

    for (const providerName of ["tyme4ts", "tyme4ts@1.5.2"]) {
      expect(
        ProductionEligibleFixtureSchema.safeParse({
          ...validGateProbe,
          sourceName: providerName,
        }).success,
      ).toBe(false);
    }
  });

  test("source policy binds identity to provable leaves and locator rules", () => {
    const invalidSourceClaims: unknown[] = [
      {
        ...validGateProbe,
        sourceId: "zhang-course-notes",
        sourceClassification: "user_provided_reference",
        sourceName: "河北周易研究会奇门遁甲高级班笔记",
        sourceLocator:
          "reference materials/张志春课程/河北周易研究会奇门遁甲高级班笔记.pdf，PDF第5页",
        sourceArtifactSha256: ZHANG_ARTIFACT_SHA256,
        expected: {
          pillars: { day: "丁卯" },
          lunar: { day: 9 },
        },
      },
      {
        ...validGateProbe,
        sourceId: "ccdi-shichen-article",
        sourceName: "中央纪委国家监委网站十二时辰说明",
        sourceLocator:
          "https://www.ccdi.gov.cn/lswhn/wenhua/wenyuan/201907/t20190719_27179.html，子时23:00-01:00",
        expected: {
          shichen: { branch: "子" },
          pillars: { day: "丁卯" },
        },
      },
      {
        ...validGateProbe,
        sourceLocator:
          "https://www.hko.gov.hk/tc/gts/astron2026/files/HKO_almanac_2026.pdf，2026年8月21日",
        expected: {
          solarTerms: {
            current: {
              name: "立秋",
              localDateTime: "2026-08-07T19:42:43+08:00[Asia/Shanghai]",
              instant: "2026-08-07T11:42:43Z",
            },
          },
        },
      },
      {
        ...validGateProbe,
        sourceLocator:
          "https://example.com/tc/gts/astron2026/files/HKO_almanac_2026.pdf",
      },
      {
        ...validGateProbe,
        sourceId: "zhang-course-notes",
        sourceClassification: "user_provided_reference",
        sourceName: "河北周易研究会奇门遁甲高级班笔记",
        sourceLocator: "reference materials/not-the-notes.pdf，PDF第5页",
        sourceArtifactSha256: ZHANG_ARTIFACT_SHA256,
      },
      {
        ...validGateProbe,
        sourceName: "Not the canonical HKO source name",
      },
      {
        ...validGateProbe,
        sourceId: "tyme4ts",
        sourceClassification: "provider_candidate",
        sourceIndependence: "provider_only",
        sourceName: "香港天文台分钟值旁证与tyme4ts秒级候选值",
        sourceLocator:
          "https://www.hko.gov.hk/tc/gts/astron2026/files/2026SolarTerms24.pdf，立秋2026-08-07 19:43；tyme4ts@1.5.2候选19:42:43",
        status: "verified",
        expected: {
          solarTerms: {
            current: {
              name: "立秋",
              instant: "2026-08-07T11:42:43Z",
            },
          },
        },
      },
    ];

    expect(
      invalidSourceClaims.map(
        (candidate) => FixtureCaseSchema.safeParse(candidate).success,
      ),
    ).toEqual([false, false, false, false, false, false, false]);
  });

  test("local Zhang evidence requires the pinned artifact SHA-256", () => {
    const zhangCases = normalCases.filter(
      (fixture) => fixture.sourceId === "zhang-course-notes",
    );
    const validZhangClaim = {
      ...validGateProbe,
      sourceId: "zhang-course-notes",
      sourceClassification: "user_provided_reference",
      sourceName: "河北周易研究会奇门遁甲高级班笔记",
      sourceLocator:
        "reference materials/张志春课程/河北周易研究会奇门遁甲高级班笔记.pdf，PDF第5页",
      expected: { pillars: { day: "丁卯" } },
    };

    expect([
      zhangCases.length === 4,
      zhangCases.every(
        (fixture) =>
          Reflect.get(fixture, "sourceArtifactSha256") ===
          ZHANG_ARTIFACT_SHA256,
      ),
      FixtureCaseSchema.safeParse({
        ...validZhangClaim,
        sourceArtifactSha256: ZHANG_ARTIFACT_SHA256,
      }).success,
      FixtureCaseSchema.safeParse(validZhangClaim).success === false,
      FixtureCaseSchema.safeParse({
        ...validZhangClaim,
        sourceArtifactSha256: ZHANG_ARTIFACT_SHA256.toUpperCase(),
      }).success === false,
      FixtureCaseSchema.safeParse(validGateProbe).success,
    ]).toEqual([true, true, true, true, true, true]);
  });

  test("unified corpus gate rejects duplicate ids across fixture files", () => {
    const normalFile = {
      schemaVersion: "time-golden-v1",
      cases: [{ ...validGateProbe, id: "cross-file-duplicate" }],
    };
    const boundaryFile = {
      schemaVersion: "time-golden-v1",
      cases: [{ ...validGateProbe, id: "cross-file-duplicate" }],
    };

    expect(
      FixtureCorpusSchema.safeParse([normalFile, boundaryFile]).success,
    ).toBe(false);
  });

  test("local source locators are repository-relative with exact PDF pages", () => {
    const zhangCases = normalCases.filter(
      (fixture) => fixture.sourceId === "zhang-course-notes",
    );
    const locators = zhangCases.map((fixture) => fixture.sourceLocator);

    expect([
      zhangCases.length === 4,
      locators.every((locator) =>
        locator.startsWith("reference materials/张志春课程/"),
      ),
      locators.every((locator) => !locator.startsWith("/Users/")),
      locators.every(
        (locator, index) => locator.endsWith(`PDF第${index + 2}页`),
      ),
      FixtureCaseSchema.safeParse({
        ...validGateProbe,
        sourceLocator: "/Users/example/reference.pdf，PDF第5页",
      }).success === false,
    ]).toEqual([true, true, true, true, true]);
  });

  test("only verified, complete fixtures enter the production set", () => {
    const productionEligible = allCases.filter(
      (fixture) =>
        ProductionEligibleFixtureSchema.safeParse(fixture).success,
    );

    expect(productionEligible.length).toBeGreaterThan(0);
    expect(productionEligible.every((fixture) => fixture.status === "verified"))
      .toBe(true);
    expect(
      boundaryCases
        .filter((fixture) => fixture.status === "boundary_review")
        .every(
          (fixture) =>
            !ProductionEligibleFixtureSchema.safeParse(fixture).success,
        ),
    ).toBe(true);
  });
});

describe("time-core golden facts", () => {
  test.each(allCases)("$id", (fixture) => {
    const resolved = resolveCivilTime(fixture.input);
    const context = buildTimeContext(resolved);

    expect(context).toMatchObject(fixture.expected);
  });
});
