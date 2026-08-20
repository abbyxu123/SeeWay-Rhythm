# SeeWay Rhythm V1 Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a deterministic, source-traceable local calculation service and connect it to the Waveshare ESP32-S3-RLCD-4.2 as an always-on display and voice terminal.

**Architecture:** Keep calendar, Qimen, Ziwei, rule evaluation, and evidence generation in testable TypeScript packages. Expose compact JSON through a local HTTP service. Build and validate the display with a desktop simulator before connecting an ESP-IDF firmware client to the same contract.

**Tech Stack:** TypeScript, Node.js, npm workspaces, Vitest, Zod, Fastify, ESP-IDF, U8g2, Unity test framework

---

## Preconditions

Do not implement interpretive Qimen or Ziwei rules until the corresponding source record and expected example exist. A passing program with an unverified rule is not acceptable.

Before implementation begins, record these decisions in `docs/rules/conventions.md`:

- Civil time, local mean solar time, or another time basis used for birth and question charts
- Day boundary and `Zi` hour convention
- Exact solar-term boundary source and precision
- Yin/Yang Dun and Ju selection method
- Rotating-plate layout convention
- Personal `year destiny`, day stem, hour stem, and category-specific useful-god priority
- Ziwei scope for V1: natal plus annual background, or additional verified layers

## Task 1: Bootstrap the TypeScript workspace

**Files:**

- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `packages/contracts/package.json`
- Create: `packages/time-core/package.json`
- Create: `packages/rule-engine/package.json`
- Create: `apps/local-service/package.json`

**Step 1: Add a failing workspace smoke test**

Create `tests/workspace.test.ts` that imports one placeholder export from `@seeway/contracts`.

**Step 2: Run the test and verify it fails**

Run: `npm test`

Expected: FAIL because the workspace and export do not exist yet.

**Step 3: Add the minimum workspace configuration**

Use npm workspaces and shared TypeScript strict settings. Add only the dependencies needed by the next task.

**Step 4: Run type checking and tests**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm test`

Expected: PASS.

**Step 5: Commit**

```bash
git add -- package.json package-lock.json tsconfig.base.json .gitignore packages apps tests
git commit -m "chore: bootstrap SeeWay workspace"
```

## Task 2: Define the device result contract

**Files:**

- Create: `packages/contracts/src/insight.ts`
- Create: `packages/contracts/src/question.ts`
- Create: `packages/contracts/src/index.ts`
- Test: `packages/contracts/test/insight.test.ts`

**Step 1: Write failing contract tests**

Cover valid and invalid directions, empty evidence, unsupported evidence levels, missing rule versions, and overlong display strings.

**Step 2: Run the focused tests**

Run: `npm test -- --run packages/contracts/test/insight.test.ts`

Expected: FAIL because schemas are not implemented.

**Step 3: Implement the minimum schemas**

The public result must include:

```ts
type EvidenceLevel = "clear" | "mixed" | "insufficient";

interface PeriodInsight {
  period: { startsAt: string; endsAt: string };
  summary: string;
  favorable: string[];
  cautions: string[];
  supportiveDirection: string | null;
  avoidDirection: string | null;
  action: string;
  nextPeriod: string;
  evidenceLevel: EvidenceLevel;
  ruleVersion: string;
  evidenceIds: string[];
  generatedAt: string;
}
```

Add explicit display-length limits matching a 300 x 400 monochrome screen.

**Step 4: Run focused and full tests**

Expected: PASS.

**Step 5: Commit**

```bash
git add -- packages/contracts
git commit -m "feat: define insight and question contracts"
```

## Task 3: Build the civil-time and Shichen foundation

**Files:**

- Create: `packages/time-core/src/shichen.ts`
- Create: `packages/time-core/src/time-input.ts`
- Create: `packages/time-core/src/index.ts`
- Test: `packages/time-core/test/shichen.test.ts`
- Create: `tests/fixtures/time-boundaries.json`

**Step 1: Add boundary fixtures**

Include every two-hour boundary, the 23:00 `Zi` boundary, date rollover, timezone offset changes, and invalid local times.

**Step 2: Write failing tests**

Test that one millisecond before and at every boundary maps to the expected period.

**Step 3: Run the focused test**

Run: `npm test -- --run packages/time-core/test/shichen.test.ts`

Expected: FAIL.

**Step 4: Implement the minimum deterministic mapping**

Return start, end, branch, civil date, timezone, and convention version. Do not add solar-term logic in this task.

**Step 5: Run tests and commit**

```bash
git add -- packages/time-core tests/fixtures/time-boundaries.json
git commit -m "feat: add deterministic shichen boundaries"
```

## Task 4: Create the source-backed rule registry

**Files:**

- Create: `docs/rules/conventions.md`
- Create: `docs/rules/source-index.md`
- Create: `packages/rule-engine/src/rule-schema.ts`
- Create: `packages/rule-engine/src/registry.ts`
- Create: `packages/rule-engine/rules/foundations.json`
- Test: `packages/rule-engine/test/registry.test.ts`

**Step 1: Record source metadata without copying source books**

Each entry must include source title, page or lesson location, school, interpretation notes, and verification status.

**Step 2: Write failing registry tests**

Reject missing IDs, duplicate IDs, unsupported schools, absent citations, unverified executable rules, and invalid conflict priorities.

**Step 3: Implement schema and loader**

Use a stable rule ID format such as `QM-TIME-001`, `QM-DOOR-001`, `ZW-ANNUAL-001`, and `HL-MAP-001`.

**Step 4: Run tests and commit**

```bash
git add -- docs/rules packages/rule-engine
git commit -m "feat: add source-backed rule registry"
```

## Task 5: Establish manual golden cases before Qimen implementation

**Files:**

- Create: `tests/fixtures/qimen-golden/README.md`
- Create: `tests/fixtures/qimen-golden/basic-cases.json`
- Create: `tests/fixtures/qimen-golden/boundary-cases.json`
- Create: `scripts/validate-golden-cases.ts`
- Test: `tests/golden-cases.test.ts`

**Step 1: Manually verify a small representative set**

Include normal Yang Dun, normal Yin Dun, a solar-term transition, date rollover, and at least one case with conflicting indicators. Store inputs, expected palace data, expected evidence IDs, and manual verifier notes.

**Step 2: Write failing fixture-validation tests**

Ensure no executable case lacks source references, expected values, or verifier status.

**Step 3: Implement fixture validation**

Validation must not calculate the chart; it only guarantees fixture completeness and provenance.

**Step 4: Run tests and commit**

```bash
git add -- tests/fixtures/qimen-golden tests/golden-cases.test.ts scripts/validate-golden-cases.ts
git commit -m "test: add verified Qimen golden cases"
```

## Task 6: Implement the Qimen chart in vertical slices

**Files:**

- Create: `packages/qimen-core/package.json`
- Create: `packages/qimen-core/src/types.ts`
- Create: `packages/qimen-core/src/chart.ts`
- Create: `packages/qimen-core/src/index.ts`
- Test: `packages/qimen-core/test/chart.test.ts`

**Step 1: Add one failing golden-case test**

Start with the smallest verified normal case. Assert every intermediate layer, not only the final prose result.

**Step 2: Implement only enough for that case**

Build in this order: time inputs, Dun and Ju, Earth plate, Heaven plate, value symbols, stars, doors, deities, void and horse markers.

**Step 3: Add the next golden case**

Repeat failing test, minimum implementation, passing test for each verified case. Never implement an unsupported branch speculatively.

**Step 4: Run the complete golden suite**

Expected: every intermediate value matches the manually verified fixture.

**Step 5: Commit each completed vertical slice separately**

Stage only the slice files and corresponding fixtures.

## Task 7: Evaluate evidence without generating prose

**Files:**

- Create: `packages/rule-engine/src/evaluate.ts`
- Create: `packages/rule-engine/src/conflicts.ts`
- Create: `packages/rule-engine/src/categories.ts`
- Test: `packages/rule-engine/test/evaluate.test.ts`

**Step 1: Write tests for category independence**

Verify that one period can be favorable for study and unfavorable for negotiation without collapsing to one total score.

**Step 2: Write tests for conflicts and insufficient evidence**

Expected outputs are `clear`, `mixed`, or `insufficient`, with retained supporting and opposing evidence IDs.

**Step 3: Implement deterministic evaluation**

Do not call an LLM. Return structured evidence only.

**Step 4: Run tests and commit**

```bash
git add -- packages/rule-engine
git commit -m "feat: evaluate category evidence deterministically"
```

## Task 8: Compose screen-safe conclusions

**Files:**

- Create: `packages/rule-engine/src/compose.ts`
- Create: `packages/rule-engine/templates/zh-CN.json`
- Test: `packages/rule-engine/test/compose.test.ts`

**Step 1: Write failing snapshot tests**

Cover clear favorable, clear caution, mixed, insufficient, missing direction, and next-period preview cases.

**Step 2: Implement template-only composition**

The first working version must use controlled templates. Defer optional LLM paraphrasing until deterministic output is trusted.

**Step 3: Enforce display limits**

No field may overflow the contract limits defined for the 300 x 400 display.

**Step 4: Run tests and commit**

```bash
git add -- packages/rule-engine
git commit -m "feat: compose auditable device conclusions"
```

## Task 9: Expose the local service

**Files:**

- Create: `apps/local-service/src/server.ts`
- Create: `apps/local-service/src/routes/current.ts`
- Create: `apps/local-service/src/routes/future.ts`
- Create: `apps/local-service/src/routes/question.ts`
- Test: `apps/local-service/test/server.test.ts`

**Step 1: Write failing API tests**

Test `GET /v1/current`, `GET /v1/future`, and `POST /v1/question`. Reject invalid profile IDs, stale device clocks, unsupported contract versions, and incomplete questions.

**Step 2: Implement routes using the shared schemas**

Store profiles in a local file outside the repository. Never log raw birth data or audio by default.

**Step 3: Add cache headers and version fields**

The device must be able to detect stale or incompatible payloads.

**Step 4: Run tests and commit**

```bash
git add -- apps/local-service
git commit -m "feat: expose local insight service"
```

## Task 10: Build a 300 x 400 device simulator

**Files:**

- Create: `apps/device-simulator/index.html`
- Create: `apps/device-simulator/src/main.ts`
- Create: `apps/device-simulator/src/styles.css`
- Test: `apps/device-simulator/test/render.test.ts`

**Step 1: Write layout tests against maximum-length contract fixtures**

Assert that all text remains within a fixed 300 x 400 monochrome viewport.

**Step 2: Implement current, next-period, background, offline, and question-confirmation screens**

Use only black and white. Avoid hover-only controls because the hardware has no pointer.

**Step 3: Verify desktop screenshots at exact device resolution**

Check normal, longest text, offline, and error states.

**Step 4: Commit**

```bash
git add -- apps/device-simulator
git commit -m "feat: add RLCD device simulator"
```

## Task 11: Connect the ESP32-S3 RLCD firmware

**Files:**

- Create: `apps/device-firmware/CMakeLists.txt`
- Create: `apps/device-firmware/main/CMakeLists.txt`
- Create: `apps/device-firmware/main/app_main.cpp`
- Create: `apps/device-firmware/main/display.cpp`
- Create: `apps/device-firmware/main/client.cpp`
- Create: `apps/device-firmware/main/cache.cpp`
- Create: `apps/device-firmware/main/buttons.cpp`
- Test: `apps/device-firmware/test/test_contract.cpp`

**Step 1: Flash the vendor display example unchanged**

Verify orientation, contrast, partial refresh, Chinese glyph rendering, RTC, KEY input, microphone, and speaker before project integration.

**Step 2: Add a failing firmware contract test**

Use a saved valid payload and malformed payloads. The firmware must reject incompatible versions without deleting the last valid cache.

**Step 3: Implement display, HTTP client, and cache separately**

Render a bundled fixture first, then cached SD data, then live service data.

**Step 4: Add button state tests**

Cover short press, long press, bounce, cancellation, and recovery after restart.

**Step 5: Run hardware checks and commit each subsystem separately**

Do not combine display, networking, audio, and power changes into one commit.

## Task 12: Add push-to-talk question capture

**Files:**

- Create: `apps/device-firmware/main/audio.cpp`
- Create: `apps/local-service/src/speech/transcribe.ts`
- Create: `apps/local-service/src/questions/structure.ts`
- Test: `apps/local-service/test/question-structure.test.ts`

**Step 1: Write tests from recorded and typed question transcripts**

Cover all eight categories, ambiguous times, missing people, recognition errors, and requests that require one clarification.

**Step 2: Implement transcript structure extraction**

The result must validate against `QuestionSchema`. Never pass raw model prose directly to the rule engine.

**Step 3: Implement confirmation on the RLCD**

Display the recognized category, action, and target time. Require explicit confirmation before calculation.

**Step 4: Add privacy controls**

Delete raw audio immediately after successful transcription unless the user explicitly enables diagnostic retention.

**Step 5: Run end-to-end tests and commit**

```bash
git add -- apps/device-firmware apps/local-service packages/contracts
git commit -m "feat: add confirmed voice question flow"
```

## Task 13: Verify the V1 vertical slice

**Files:**

- Create: `docs/testing/v1-checklist.md`
- Create: `tests/e2e/current-period.test.ts`
- Create: `tests/e2e/question-flow.test.ts`

**Step 1: Run automated verification**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm test`

Expected: PASS.

Run the firmware unit tests using the selected ESP-IDF target.

Expected: PASS.

**Step 2: Run hardware scenarios**

Verify power loss, Wi-Fi loss, local service restart, time drift, a Shichen boundary, a solar-term boundary, maximum-length Chinese text, and a failed voice transcription.

**Step 3: Compare against manual golden cases**

Every displayed conclusion must resolve to evidence IDs and source records. Record any difference before changing code or fixtures.

**Step 4: Update README status only after evidence exists**

Mark roadmap items complete only when their automated and hardware checks pass.

**Step 5: Commit verification artifacts**

```bash
git add -- docs/testing tests/e2e README.md
git commit -m "test: verify V1 vertical slice"
```
