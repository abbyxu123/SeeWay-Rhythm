# Time and Qimen Core Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a deterministic civil-time and Chinese calendar core, then establish the verified data contracts and golden-case gate required before implementing Zhang Zhichun rotating Qimen charts.

**Architecture:** `time-core` owns timezone resolution, shichen boundaries, solar terms, lunar dates, and sexagenary pillars. `qimen-core` owns only Qimen domain mappings and chart facts, consuming an immutable `time-core` context. A separate verification gate checks independent derivations and chart invariants before analysis, while versioned profile snapshots and precomputed caches keep repeated reads fast. Third-party calendar output is wrapped and pinned; Qimen availability remains `unverified` until manually checked golden charts pass palace by palace.

**Tech Stack:** TypeScript 5.9, Vitest 3, Zod 4, `@js-temporal/polyfill` 0.5.1, `tyme4ts` 1.5.2, npm workspaces.

---

### Task 1: Create the `time-core` package and fixed cycle vocabulary

**Files:**
- Create: `packages/time-core/package.json`
- Create: `packages/time-core/tsconfig.json`
- Create: `packages/time-core/src/cycles.ts`
- Create: `packages/time-core/src/index.ts`
- Test: `packages/time-core/test/cycles.test.ts`
- Modify: `tsconfig.base.json`

**Step 1: Write the failing cycle tests**

Test that the ten stems and twelve branches are in canonical order, that all 60 stem-branch pairs are unique, and that indexes reject non-integers and values outside `0..59`.

```ts
expect(HEAVENLY_STEMS).toEqual([
  "甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸",
]);
expect(EARTHLY_BRANCHES).toEqual([
  "子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥",
]);
expect(sexagenaryName(0)).toBe("甲子");
expect(sexagenaryName(59)).toBe("癸亥");
```

**Step 2: Run the focused test and confirm RED**

Run: `npm test -- --run packages/time-core/test/cycles.test.ts`

Expected: FAIL because `@seeway/time-core` does not exist.

**Step 3: Add the package and minimal cycle implementation**

Export readonly stem and branch tuples and a checked `sexagenaryName(index)` function. Add `@seeway/time-core` to root TypeScript paths.

**Step 4: Run focused tests and typecheck**

Run: `npm test -- --run packages/time-core/test/cycles.test.ts && npm run typecheck`

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/time-core tsconfig.base.json
git commit -m "feat: add time core cycle vocabulary"
```

### Task 2: Resolve civil time without silent timezone guesses

**Files:**
- Modify: `packages/time-core/package.json`
- Create: `packages/time-core/src/civil-time.ts`
- Modify: `packages/time-core/src/index.ts`
- Test: `packages/time-core/test/civil-time.test.ts`

**Step 1: Write failing input and timezone tests**

Cover:

- `2026-08-21T11:54:00` in `Asia/Shanghai` maps to `2026-08-21T03:54:00Z`.
- The original local value and IANA zone are preserved.
- Missing seconds are accepted only when precision is declared as `minute`.
- Invalid zones, impossible dates, offset-bearing local values, and ambiguous DST times are rejected.

```ts
const result = resolveCivilTime({
  localDateTime: "2026-08-21T11:54:00",
  timeZone: "Asia/Shanghai",
  precision: "second",
});
expect(result.instant).toBe("2026-08-21T03:54:00Z");
```

**Step 2: Run the focused test and confirm RED**

Run: `npm test -- --run packages/time-core/test/civil-time.test.ts`

Expected: FAIL because `resolveCivilTime` is missing.

**Step 3: Implement with Temporal**

Use `Temporal.PlainDateTime.from` and `toZonedDateTime` with `disambiguation: "reject"`. Return a frozen object containing the original input, canonical local time, zone, offset, instant, precision, and `time-cn-zhang-v1` convention version.

**Step 4: Run focused tests and typecheck**

Run: `npm test -- --run packages/time-core/test/civil-time.test.ts && npm run typecheck`

Expected: PASS.

**Step 5: Commit**

```bash
git add package.json package-lock.json packages/time-core
git commit -m "feat: resolve versioned civil time"
```

### Task 3: Calculate stable two-hour shichen windows

**Files:**
- Create: `packages/time-core/src/shichen.ts`
- Modify: `packages/time-core/src/index.ts`
- Test: `packages/time-core/test/shichen.test.ts`

**Step 1: Write failing boundary tests**

Cover every branch and specifically:

- `22:59:59` is 亥.
- `23:00:00` is 子 with a start on the same civil date.
- `00:00:00` is 子 with a start at 23:00 on the previous civil date.
- `00:59:59` is 子 and `01:00:00` is 丑.
- A non-China IANA timezone preserves the local two-hour boundary.

```ts
expect(shichenFor(resolveCivilTime(input("2026-08-21T11:54:00")))).toMatchObject({
  branch: "午",
  index: 6,
  startLocal: "2026-08-21T11:00:00+08:00[Asia/Shanghai]",
  endLocal: "2026-08-21T13:00:00+08:00[Asia/Shanghai]",
});
```

**Step 2: Run and confirm RED**

Run: `npm test -- --run packages/time-core/test/shichen.test.ts`

Expected: FAIL because `shichenFor` is missing.

**Step 3: Implement the shichen mapping**

Use the canonical branch index `Math.floor(((hour + 1) % 24) / 2)`. Derive start and end as zoned times, not string arithmetic. Return frozen boundary facts and the next shichen.

**Step 4: Run focused and complete `time-core` tests**

Run: `npm test -- --run packages/time-core/test`

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/time-core
git commit -m "feat: calculate shichen boundaries"
```

### Task 4: Wrap `tyme4ts` as a pinned calendar fact provider

**Files:**
- Modify: `packages/time-core/package.json`
- Create: `packages/time-core/src/calendar-provider.ts`
- Create: `packages/time-core/src/context.ts`
- Modify: `packages/time-core/src/index.ts`
- Test: `packages/time-core/test/calendar-provider.test.ts`
- Test: `packages/time-core/test/context.test.ts`

**Step 1: Write failing adapter tests**

For `2026-08-21T11:54:00 Asia/Shanghai`, compare the adapter output against a checked fixture for:

- lunar date,
- year, month, day, and hour sexagenary names,
- current solar term name,
- exact previous/current and next solar-term instants,
- library and convention versions.

Do not assert `tyme4ts` almanac recommendations or auspiciousness fields.

**Step 2: Run and confirm RED**

Run: `npm test -- --run packages/time-core/test/calendar-provider.test.ts packages/time-core/test/context.test.ts`

Expected: FAIL because the provider and context builder are missing.

**Step 3: Implement the adapter**

Construct `SolarTime.fromYmdHms(...)`, then read:

```ts
const hour = solarTime.getSixtyCycleHour();
const lunar = solarTime.getLunarHour();
const term = solarTime.getTerm();
```

Map provider objects immediately to plain frozen project types. Never expose `tyme4ts` classes across the package boundary.

**Step 4: Build the immutable time context**

Compose civil time, shichen, lunar date, pillars, and solar-term facts. Parse the final object with a strict Zod schema before returning it.

**Step 5: Verify**

Run: `npm test -- --run packages/time-core/test && npm run typecheck`

Expected: PASS.

**Step 6: Commit**

```bash
git add package.json package-lock.json packages/time-core
git commit -m "feat: build verified calendar context"
```

### Task 5: Add independent calendar fixtures and boundary provenance

**Files:**
- Create: `tests/fixtures/time-core/normal-cases.json`
- Create: `tests/fixtures/time-core/boundary-cases.json`
- Create: `tests/fixtures/time-core/README.md`
- Create: `tests/time-golden.test.ts`

**Step 1: Define fixture provenance fields**

Each case records input, expected intermediate facts, source name, source locator, verifier, verification date, status, and notes. Only cases with `status: "verified"` may be used to enable production behavior.

**Step 2: Add normal and boundary cases**

Include at least one ordinary Shanghai time, 22:59/23:00/00:00/01:00 boundaries, and one exact solar-term transition with one second on either side.

**Step 3: Write the fixture runner and verify**

Run: `npm test -- --run tests/time-golden.test.ts`

Expected: PASS only for verified fixtures; malformed or draft fixtures are rejected.

**Step 4: Commit**

```bash
git add tests/fixtures/time-core tests/time-golden.test.ts
git commit -m "test: add calendar golden cases"
```

### Task 6: Create `qimen-core` fixed facts and strict chart contracts

**Files:**
- Create: `packages/qimen-core/package.json`
- Create: `packages/qimen-core/tsconfig.json`
- Create: `packages/qimen-core/src/constants.ts`
- Create: `packages/qimen-core/src/schema.ts`
- Create: `packages/qimen-core/src/index.ts`
- Test: `packages/qimen-core/test/constants.test.ts`
- Test: `packages/qimen-core/test/schema.test.ts`
- Modify: `tsconfig.base.json`

**Step 1: Write failing mapping tests**

Lock the canonical Luo Shu palace numbers, trigrams, directions, elements, nine stars, eight gates, eight deities, and three-wonders/six-instruments vocabulary. Test uniqueness and palace completeness.

**Step 2: Write failing chart-schema tests**

Require exactly nine palaces and one occurrence of each movable star and gate where applicable. Require algorithm version, source references, dun type, ju number, yuan, chief star, chief gate, void palaces, and horse palace. Reject unknown or incomplete fields.

**Step 3: Implement only fixed facts and schemas**

Do not calculate dun, ju, chief star, chief gate, or palace rotation yet. Export `QIMEN_CORE_STATUS = "unverified"`.

**Step 4: Verify**

Run: `npm test -- --run packages/qimen-core/test && npm run typecheck`

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/qimen-core tsconfig.base.json
git commit -m "feat: define qimen chart facts"
```

### Task 7: Establish the Qimen golden-case gate before chart calculation

**Status:** Completed on 2026-08-26. This opens only calculator development; all Qimen Agents remain `unverified`.

**Files:**
- Create: `tests/fixtures/qimen-golden/README.md`
- Create: `tests/fixtures/qimen-golden/cases.schema.json`
- Create: `tests/fixtures/qimen-golden/verified-cases.json`
- Create: `tests/fixtures/qimen-golden/rejected-cases.json`
- Create: `tests/qimen-golden-gate.test.ts`
- Create: `packages/qimen-core/src/readiness.ts`
- Create: `packages/qimen-core/src/golden.ts`
- Modify: `packages/qimen-core/src/index.ts`
- Create: `scripts/generate-qimen-golden-schema.ts`
- Create: `scripts/qimen-golden-audit.ts`
- Create: `scripts/qimen-source-audit.ts`
- Modify: `package.json`
- Modify: `docs/rules/conventions.md`
- Create: `docs/rules/source-catalog.md`
- Test: `tests/qimen-source-audit.test.ts`
- Test: `tests/qimen-golden-audit.test.ts`

**Step 1: Define palace-by-palace fixture structure**

Each case must store the time-context version, Qimen version, source locator, dun, ju, yuan, chief star, chief gate, all nine palace facts, void, horse, verifier, verification date, and status.

**Step 2: Add verified cases from the supplied Zhang Zhichun materials**

Transcribe each case twice, validate all nine palaces with `QimenChartSchema`, and independently rebuild its time context. Record unresolved source discrepancies separately so they cannot change expected results.

**Step 3: Write a failing gate test**

The gate must prove that no Qimen Agent can become `available` while there are zero palace-complete verified cases.

**Step 4: Implement the audited development gate and keep Agents unsupported**

Name the in-package predicate `structure readiness`: it requires at least three palace-complete cases covering both Yin and Yang Dun, distinct evidence and palace arrangements, and three distinct Dun/Ju combinations. The complete local gate must additionally rebuild each time context and hash the actual private source PDFs. Update the convention and source tables while leaving calculator availability pending.

**Step 5: Verify**

Run: `npm test -- --run tests/qimen-golden-gate.test.ts tests/qimen-golden-audit.test.ts tests/qimen-source-audit.test.ts packages/control-plane/test/registry.test.ts`

Run on the source-holding machine: `npm run audit:qimen-golden -- /absolute/path/to/SeeWay-Rhythm`

Expected: PASS, with Qimen still `unverified`.

**Step 6: Commit**

```bash
git add package.json packages/qimen-core scripts tests/fixtures/qimen-golden tests/qimen-golden-gate.test.ts tests/qimen-golden-audit.test.ts tests/qimen-source-audit.test.ts docs/rules
git commit -m "test: gate qimen calculation on verified charts"
```

### Task 8: Define profile snapshots, verification reports, and cache identities

**Files:**
- Create: `packages/contracts/src/profile.ts`
- Create: `packages/contracts/src/verification.ts`
- Create: `packages/contracts/src/cache.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/test/profile-verification.test.ts`

**Step 1: Write failing contract tests**

Require immutable profile versions, explicit input precision, calculation version bundles, one of the four verification statuses, structured check results, result hashes, valid periods, and cache identities. Reject a display payload unless its verification status is `verified`.

**Step 2: Run and confirm RED**

Run: `npm test -- --run packages/contracts/test/profile-verification.test.ts`

Expected: FAIL because the contracts do not exist.

**Step 3: Implement strict Zod contracts**

Keep billing and profile-count entitlements outside these contracts. The same verification schema applies to every profile and product tier.

**Step 4: Verify**

Run: `npm test -- --run packages/contracts/test/profile-verification.test.ts && npm run typecheck`

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat: define verified calculation identities"
```

### Task 9: Add the runtime chart verification gate

**Prerequisite:** Complete a dedicated, reviewed calculator plan for dun/yuan/ju, earth plate, xun head, void/horse, chief star/gate, heaven plate, stars, gates and deities. Task 9 must not be started against a placeholder chart builder.

**Files:**
- Create: `packages/qimen-core/src/verifier.ts`
- Modify: `packages/qimen-core/src/index.ts`
- Create: `packages/control-plane/src/qimen-availability.ts`
- Test: `packages/qimen-core/test/verifier.test.ts`
- Test: `packages/control-plane/test/qimen-availability.test.ts`
- Test: `tests/e2e/verified-chart-flow.test.ts`

**Step 1: Write failing invariant tests**

Cover duplicate or missing palace elements, mismatched chief star/gate positions, wrong dun/ju metadata, unsupported source versions, boundary escalation, and a fully valid chart. Prove that blocked and unverified reports never reach the presenter.

**Step 2: Run and confirm RED**

Run: `npm test -- --run packages/qimen-core/test/verifier.test.ts tests/e2e/verified-chart-flow.test.ts`

Expected: FAIL because the verifier is missing.

**Step 3: Implement the independent verifier**

The verifier may consume chart output and immutable rule tables but must not call the chart builder's orchestration function. Return individual check IDs, status, source and algorithm versions, chart hash, and duration.

**Step 4: Add the presentation gate**

Only `verified` charts may produce favorable, caution, direction, or action fields. Other statuses produce a structured waiting, review, unsupported, or error result without divination text.

Create one availability predicate that requires the golden-case gate, deterministic calculator suite and independent runtime verifier together. Agent Registry must consume this predicate rather than maintain a separate hard-coded status.

**Step 5: Verify and commit**

Run: `npm test -- --run packages/qimen-core/test tests/e2e/verified-chart-flow.test.ts && npm run typecheck`

```bash
git add packages/qimen-core packages/control-plane tests/e2e
git commit -m "feat: verify charts before analysis"
```

### Task 10: Add deterministic precomputation and cache keys

**Files:**
- Create: `packages/control-plane/src/calculation-cache.ts`
- Modify: `packages/control-plane/src/index.ts`
- Test: `packages/control-plane/test/calculation-cache.test.ts`

**Step 1: Write failing cache tests**

Prove that identical profile, period, place and version bundles reuse a verified result; changing any version invalidates the key; unverified results are never served as current verified output; and the next twelve shichen can be scheduled without duplicate work.

**Step 2: Implement the minimal cache identity and scheduler**

Keep storage behind an interface. The first implementation may be in-memory; persistence and device synchronization come later without changing cache identity rules.

**Step 3: Verify and commit**

Run: `npm test -- --run packages/control-plane/test/calculation-cache.test.ts && npm run typecheck`

```bash
git add packages/control-plane
git commit -m "feat: cache verified calculation periods"
```

### Task 11: Verify the complete foundation

**Files:**
- Modify: `README.md`

**Step 1: Update truthful project status**

Document what `time-core` can calculate, which cases have been independently verified, and why Qimen still returns `unsupported` until palace-complete goldens exist.

**Step 2: Run fresh full verification**

Run:

```bash
npm test
npm run typecheck
git diff --check
git status --short
```

Expected: all tests pass, typecheck exits zero, no whitespace errors, and only intentional changes remain.

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: report time core verification status"
```

**Step 4: Review before integration**

Use `superpowers:requesting-code-review`, fix material findings, rerun the complete verification, then merge the feature branch only after review is clean.
