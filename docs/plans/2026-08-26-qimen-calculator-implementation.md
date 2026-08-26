# Qimen Calculator and Profile Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Calculate a verified Zhang Zhichun rotating, split-supplement time-Qimen chart from a target civil time, keep birth data in a separate versioned profile, and show evidence-backed summary or nine-palace facts on the RLCD device.

**Architecture:** `time-core` remains the only calendar provider. `qimen-core` consumes a canonically rebuilt `TimeContext` and produces immutable facts in layers; an independent verifier gates all analysis. `contracts` owns profile and device payload schemas, while firmware only renders verified payloads and never implements divination rules.

**Tech Stack:** TypeScript 5.9, Vitest 3, Zod 4, `@js-temporal/polyfill` 0.5.1, `tyme4ts` 1.5.2, ESP-IDF 5.5, Waveshare ESP32-S3-RLCD-4.2.

---

### Task 1: Calculate Yin/Yang Dun, symbol-head Yuan and Ju

**Files:**
- Modify: `packages/qimen-core/package.json`
- Modify: `packages/time-core/src/index.ts`
- Create: `packages/qimen-core/src/bureau.ts`
- Modify: `packages/qimen-core/src/index.ts`
- Test: `packages/qimen-core/test/bureau.test.ts`
- Test: `tests/qimen-bureau-golden.test.ts`

**Step 1: Write failing table and Yuan tests**

Lock the 24 solar-term table and all twelve symbol-head groups. Cover the source examples:

```ts
expect(yuanForDayPillar("庚申")).toEqual({
  yuan: "下元",
  symbolHead: "己未",
});
expect(yuanForDayPillar("乙巳")).toEqual({
  yuan: "下元",
  symbolHead: "甲辰",
});
expect(yuanForDayPillar("丙辰")).toEqual({
  yuan: "中元",
  symbolHead: "甲寅",
});
```

Generate all sixty day pillars and prove each maps to the nearest preceding five-day symbol head, with exactly twenty days in each Yuan.

**Step 2: Write failing bureau tests**

Build canonical time contexts for the three verified source cases and expect:

```ts
expect(determineQimenBureau(context1997)).toMatchObject({
  solarTerm: "惊蛰",
  dunType: "阳遁",
  yuan: "下元",
  juNumber: 4,
});
```

Also test one second before and exactly at the computed Summer Solstice and Winter Solstice instants so the change follows `time-core`, not a civil-date shortcut. Reject forged `TimeContext` objects whose pillars or solar terms do not match their civil time.

**Step 3: Run focused tests and confirm RED**

Run: `npm test -- --run packages/qimen-core/test/bureau.test.ts tests/qimen-bureau-golden.test.ts`

Expected: FAIL because `yuanForDayPillar` and `determineQimenBureau` do not exist.

**Step 4: Implement immutable bureau facts**

Export a readonly 24-term table, `QimenYuanSchema`, `QimenBureauFactSchema`, `yuanForDayPillar(dayPillar)` and `determineQimenBureau(timeContext)`. Parse the complete input with `TimeContextSchema`; do not accept term names or pillars as independent free strings.

**Step 5: Verify**

Run: `npm test -- --run packages/qimen-core/test/bureau.test.ts tests/qimen-bureau-golden.test.ts`

Run: `npm test && npm run typecheck && git diff --check`

Expected: all tests pass, with all Qimen Agents still `unverified`.

**Step 6: Commit**

```bash
git add packages/time-core packages/qimen-core tests/qimen-bureau-golden.test.ts
git commit -m "feat: calculate qimen dun yuan and ju"
```

### Task 2: Build the earth plate

**Files:**
- Create: `packages/qimen-core/src/earth-plate.ts`
- Modify: `packages/qimen-core/src/index.ts`
- Test: `packages/qimen-core/test/earth-plate.test.ts`
- Test: `tests/qimen-earth-plate-golden.test.ts`

**Step 1: Write failing placement tests**

Lock the placement sequence `戊己庚辛壬癸丁丙乙`. Test Yang Dun forward and Yin Dun reverse wrapping across palace 9/1. Assert all nine stems are unique.

**Step 2: Write failing golden tests**

Compare palace-by-palace earth-plate stems for all three verified cases. Do not read expected palace values inside the implementation.

**Step 3: Run and confirm RED**

Run: `npm test -- --run packages/qimen-core/test/earth-plate.test.ts tests/qimen-earth-plate-golden.test.ts`

Expected: FAIL because `buildEarthPlate` is missing.

**Step 4: Implement and verify**

Consume only a parsed `QimenBureauFact`. Return nine frozen `{ palaceNumber, stem }` records in canonical palace-number order.

Run: `npm test -- --run packages/qimen-core/test/earth-plate.test.ts tests/qimen-earth-plate-golden.test.ts && npm run typecheck`

**Step 5: Commit**

```bash
git add packages/qimen-core tests/qimen-earth-plate-golden.test.ts
git commit -m "feat: build qimen earth plate"
```

### Task 3: Calculate Xun head, void and horse facts

**Files:**
- Create: `packages/qimen-core/src/hour-facts.ts`
- Modify: `packages/qimen-core/src/index.ts`
- Test: `packages/qimen-core/test/hour-facts.test.ts`
- Test: `tests/qimen-hour-facts-golden.test.ts`

**Step 1: Write failing sixty-hour tests**

For every sexagenary hour, prove the Xun head is the preceding cycle index divisible by ten and maps to the locked six-instrument fact. Test the four horse groups and all six void-palace groups.

**Step 2: Write failing golden tests**

Expect:

- 丁亥 -> 甲申/庚, void 2 and 9, horse 4.
- 癸未 -> 甲戌/己, void 2 and 7, horse 4.
- 甲午 -> 甲午/辛, void 4, horse 2.

**Step 3: Run and confirm RED**

Run: `npm test -- --run packages/qimen-core/test/hour-facts.test.ts tests/qimen-hour-facts-golden.test.ts`

**Step 4: Implement and verify**

Return a frozen `QimenHourFacts` parsed by a strict schema. Reject any pillar outside the sixty-name cycle.

Run: `npm test -- --run packages/qimen-core/test/hour-facts.test.ts tests/qimen-hour-facts-golden.test.ts && npm run typecheck`

**Step 5: Commit**

```bash
git add packages/qimen-core tests/qimen-hour-facts-golden.test.ts
git commit -m "feat: calculate qimen hour facts"
```

### Task 4: Build the complete rotating chart

**Files:**
- Create: `packages/qimen-core/src/rotation.ts`
- Create: `packages/qimen-core/src/calculator.ts`
- Modify: `packages/qimen-core/src/index.ts`
- Test: `packages/qimen-core/test/rotation.test.ts`
- Test: `packages/qimen-core/test/calculator.test.ts`
- Test: `tests/qimen-chart-golden.test.ts`

**Step 1: Write failing chief-star and chief-gate tests**

Use the earth-plate palace holding the hidden Xun-head instrument to derive the chief star and chief gate. Cover center-palace lodging explicitly.

**Step 2: Write failing rotation tests**

Test heaven plate, nine stars, eight gates and eight deities separately for Yang and Yin Dun. Test Fu Yin and non-Fu-Yin cases. Each table must contain the exact fixed vocabulary once.

**Step 3: Write the failing full-golden test**

Call only `calculateQimenChart(timeContext, sourceReference)` for each verified case and compare the complete parsed `QimenChart` palace by palace.

**Step 4: Run and confirm RED**

Run: `npm test -- --run packages/qimen-core/test/rotation.test.ts packages/qimen-core/test/calculator.test.ts tests/qimen-chart-golden.test.ts`

**Step 5: Implement one layer at a time**

Keep bureau, earth plate, hour facts, star rotation, gate rotation and deity rotation as separate pure functions. `calculateQimenChart` only orchestrates and parses the final schema.

**Step 6: Verify and commit**

Run: `npm test -- --run packages/qimen-core/test tests/qimen-chart-golden.test.ts && npm run typecheck`

```bash
git add packages/qimen-core tests/qimen-chart-golden.test.ts
git commit -m "feat: calculate complete rotating qimen chart"
```

### Task 5: Add the independent verifier and availability manifest

**Files:**
- Create: `packages/qimen-core/src/verifier.ts`
- Modify: `packages/qimen-core/src/index.ts`
- Create: `packages/control-plane/src/qimen-availability.ts`
- Modify: `packages/control-plane/src/registry.ts`
- Modify: `packages/control-plane/src/index.ts`
- Test: `packages/qimen-core/test/verifier.test.ts`
- Test: `packages/control-plane/test/qimen-availability.test.ts`
- Test: `tests/e2e/verified-chart-flow.test.ts`

**Step 1: Write failing mutation tests**

Starting from each calculated golden chart, independently change one Ju, earth stem, heaven stem, star, gate, deity, void palace or horse palace. Every mutation must be blocked.

**Step 2: Write the failing availability test**

Prove Qimen Agents remain `unverified` unless golden evidence, calculator suite and verifier version are all enabled in one manifest.

**Step 3: Implement without calling the calculator orchestrator**

The verifier may use immutable tables and low-level independent derivations, but not `calculateQimenChart`.

**Step 4: Verify and commit**

Run: `npm test -- --run packages/qimen-core/test/verifier.test.ts packages/control-plane/test/qimen-availability.test.ts tests/e2e/verified-chart-flow.test.ts && npm run typecheck`

```bash
git add packages/qimen-core packages/control-plane tests/e2e
git commit -m "feat: verify qimen charts before availability"
```

### Task 6: Add versioned birth profiles without changing chart facts

**Files:**
- Create: `packages/contracts/src/profile.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/control-plane/src/profile-store.ts`
- Modify: `packages/control-plane/src/index.ts`
- Test: `packages/contracts/test/profile.test.ts`
- Test: `packages/control-plane/test/profile-store.test.ts`
- Test: `tests/e2e/profile-chart-isolation.test.ts`

**Step 1: Write failing profile-contract tests**

Require `profileId`, `profileVersion`, original birth input, IANA timezone, place text and precision. Keep display name and sex optional. Reject ambiguous or silently defaulted data.

**Step 2: Write the isolation test**

Calculate the same target time for two different birth profiles and prove the base `QimenChart` hash is identical. Calculate two target times for one profile and prove the charts may differ.

**Step 3: Implement local versioned storage**

Changing birth data creates a new immutable version. Do not add billing limits to the profile contract.

**Step 4: Verify and commit**

Run: `npm test -- --run packages/contracts/test/profile.test.ts packages/control-plane/test/profile-store.test.ts tests/e2e/profile-chart-isolation.test.ts && npm run typecheck`

```bash
git add packages/contracts packages/control-plane tests/e2e
git commit -m "feat: store versioned birth profiles"
```

### Task 7: Produce evidence-backed four-category guidance

**Files:**
- Create: `docs/rules/qimen-guidance-rule-index.md`
- Create: `packages/qimen-guidance/package.json`
- Create: `packages/qimen-guidance/tsconfig.json`
- Create: `packages/qimen-guidance/src/rules.ts`
- Create: `packages/qimen-guidance/src/evaluate.ts`
- Create: `packages/qimen-guidance/src/index.ts`
- Test: `packages/qimen-guidance/test/rules.test.ts`
- Test: `packages/qimen-guidance/test/evaluate.test.ts`
- Test: `tests/e2e/qimen-guidance-flow.test.ts`

**Step 1: Extract and review rules before coding**

For every rule, record source fingerprint, page/example locator, preconditions, favorable/caution/direction/action effects, strength and conflict policy. Do not implement uncited generic fortune text.

**Step 2: Write failing rule tests**

Each rule needs hit, miss, boundary and conflict cases. Direction output must identify the source palace and distinguish supportive from avoid direction.

**Step 3: Implement deterministic evaluation**

Return the four categories plus evidence IDs and uncertainty. An empty evidence set returns `insufficient`, never filler text.

**Step 4: Verify and commit**

Run: `npm test -- --run packages/qimen-guidance/test tests/e2e/qimen-guidance-flow.test.ts && npm run typecheck`

```bash
git add docs/rules/qimen-guidance-rule-index.md packages/qimen-guidance tests/e2e
git commit -m "feat: derive cited qimen guidance"
```

### Task 8: Connect verified payloads to the RLCD device

**Files:**
- Create: `packages/contracts/src/device.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `firmware/esp32-s3-rlcd-4.2/main/qimen_payload.h`
- Create: `firmware/esp32-s3-rlcd-4.2/main/qimen_payload.c`
- Modify: `firmware/esp32-s3-rlcd-4.2/main/main.c`
- Test: `packages/contracts/test/device.test.ts`
- Test: `tests/e2e/device-payload.test.ts`

**Step 1: Write failing payload tests**

Require calculation time, target shichen, profile reference, chart hash, verification status, four result rows, directions, rule IDs and algorithm versions. Block guidance fields unless verification is `verified`.

**Step 2: Implement summary and chart views**

KEY short press selects current/next shichen. BOOT short press switches summary/full chart. Keep layout within 400x300 and add the fourth “建议” row.

**Step 3: Add local provisioning input**

Accept a versioned profile payload from the host/local setup path and persist only validated data. The device never asks the user to type a birth date with three hardware buttons.

**Step 4: Verify host and firmware builds**

Run: `npm test && npm run typecheck`

Run the ESP-IDF firmware build, flash the connected board, capture serial output and photograph both views. Confirm the board displays no guidance when verification is absent.

**Step 5: Commit**

```bash
git add packages/contracts firmware tests/e2e
git commit -m "feat: render verified qimen device payloads"
```

### Task 9: Run the real-profile end-to-end acceptance

**Files:**
- Create: `tests/fixtures/profiles/she-hongyu.json`
- Create: `docs/verification/first-profile-acceptance.md`
- Test: `tests/e2e/first-profile-acceptance.test.ts`

**Step 1: Add the supplied profile without expected divination text**

Record male, 1997-06-19 05:30, Jing County, Anhui, `Asia/Shanghai`, minute precision. Keep the name as display metadata only.

**Step 2: Run the full current-shichen flow**

Use the actual current or explicitly recorded target time, calculate the chart, verify it, evaluate cited rules and serialize the device payload. Record every version and source reference.

**Step 3: Compare manually and document discrepancies**

Do not change expected facts to make the example appear accurate. Any mismatch blocks release and is recorded with its layer.

**Step 4: Final verification and review**

Run: `npm run audit:qimen-golden -- /absolute/path/to/SeeWay-Rhythm`

Run: `npm test && npm run typecheck && git diff --check`

Request code review, resolve material findings, rebuild and reflash the board.

**Step 5: Commit**

```bash
git add tests/fixtures/profiles docs/verification tests/e2e
git commit -m "test: verify first qimen profile flow"
```
