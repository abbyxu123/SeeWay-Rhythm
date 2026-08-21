# Multi-Agent Reasoning Platform Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first runnable, source-traceable foundation that registers seven isolated Agents, routes a user request, enforces context and memory permissions, and preserves independent reports and conflicts without inventing divination results.

**Architecture:** Use a TypeScript npm workspace with Zod contracts at every trust boundary. Keep the control plane deterministic: an Agent registry declares capabilities, a router selects one primary and optional supporting Agents, policy gates restrict context and persistence, and a presenter combines reports without merging them into one auspiciousness score. Domain calculators plug into the same `DomainAgent` interface later; until a verified calculator exists, the adapter must return `unsupported`.

**Tech Stack:** Node.js, TypeScript, npm workspaces, Vitest, Zod

---

## Scope and non-goals

This plan implements the control-plane foundation that must exist before Qimen, Ziwei, Bazi, finance, or Meihua calculation code is connected.

It includes:

- Shared request, report, evidence, conflict, memory, and routing contracts.
- A registry containing the seven approved Agents.
- Deterministic routing for rhythm, query, timeline, profile, finance, and Meihua intents.
- Minimum-context and memory-consent policy gates.
- Conflict-preserving presentation.
- An end-to-end orchestration test using explicit unsupported adapters.

It does not include:

- Calendar, GanZhi, Qimen, Ziwei, Bazi, or Meihua calculations.
- LLM calls, speech recognition, market data, database storage, HTTP routes, or UI.
- Placeholder auspicious/adverse conclusions.

## Repository target

Implement in a temporary Git worktree on branch `codex/multi-agent-foundation`, then merge the verified branch into the Desktop repository's `main` branch. The canonical working repository remains `/Users/beibeixv/Desktop/SeeWay-Rhythm`.

### Task 1: Bootstrap the TypeScript workspace

**Files:**

- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.base.json`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/src/index.ts`
- Create: `tests/workspace.test.ts`

**Step 1: Write the failing smoke test**

```ts
import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION } from "@seeway/contracts";

describe("workspace", () => {
  it("resolves workspace packages", () => {
    expect(CONTRACT_VERSION).toBe("1.0.0");
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `npm test`

Expected: FAIL because no root package or contracts export exists.

**Step 3: Create the minimum workspace**

Root scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p tsconfig.base.json"
  }
}
```

Use npm workspaces for `packages/*` and `apps/*`. Enable `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noEmit` in `tsconfig.base.json`. Add only TypeScript, Vitest, Node types, and Zod.

Export this minimum implementation:

```ts
export const CONTRACT_VERSION = "1.0.0" as const;
```

**Step 4: Run verification**

Run: `npm test`

Expected: PASS with one test.

Run: `npm run typecheck`

Expected: PASS with no TypeScript errors.

**Step 5: Commit**

```bash
git add -- package.json package-lock.json tsconfig.base.json packages/contracts tests/workspace.test.ts
git commit -m "chore: bootstrap multi-agent workspace"
```

### Task 2: Define trust-boundary contracts

**Files:**

- Create: `packages/contracts/src/agent.ts`
- Create: `packages/contracts/src/evidence.ts`
- Create: `packages/contracts/src/memory.ts`
- Modify: `packages/contracts/src/index.ts`
- Test: `packages/contracts/test/agent.test.ts`

**Step 1: Write failing contract tests**

Test these invariants:

- `complete` reports require a conclusion and at least one evidence record.
- `unsupported` reports cannot contain a conclusion.
- Evidence requires a rule ID, rule version, source ID, fact path, and explanation.
- A request contains explicit profile and memory grants.
- Unknown Agent IDs, statuses, memory scopes, or tendency values fail validation.

Representative assertion:

```ts
expect(() =>
  AgentReportSchema.parse({
    agentId: "qimen-rhythm",
    agentVersion: "0.1.0",
    status: "complete",
    evidence: [],
    conflicts: [],
    requiredInputs: [],
    ruleVersion: "qimen-0.1.0",
    generatedAt: "2026-08-21T12:00:00.000Z"
  })
).toThrow();
```

**Step 2: Run the focused test and verify failure**

Run: `npm test -- --run packages/contracts/test/agent.test.ts`

Expected: FAIL because the schemas do not exist.

**Step 3: Implement the schemas**

Agent IDs:

```ts
export const AgentIdSchema = z.enum([
  "orchestrator",
  "qimen-rhythm",
  "qimen-query",
  "ziwei-timeline",
  "bazi-profile",
  "qimen-finance",
  "meihua"
]);
```

Memory scopes:

```ts
export const MemoryScopeSchema = z.enum([
  "identity",
  "preferences",
  "timeline",
  "finance",
  "career",
  "relationship"
]);
```

Use a discriminated union for `AgentReportSchema` so `complete`, `needs_input`, `unsupported`, and `error` have structurally valid payloads. Do not express those invariants only in comments.

**Step 4: Run focused and full verification**

Run: `npm test -- --run packages/contracts/test/agent.test.ts`

Expected: PASS.

Run: `npm test && npm run typecheck`

Expected: PASS.

**Step 5: Commit**

```bash
git add -- packages/contracts
git commit -m "feat: define agent trust contracts"
```

### Task 3: Register the seven approved Agents

**Files:**

- Create: `packages/control-plane/package.json`
- Create: `packages/control-plane/tsconfig.json`
- Create: `packages/control-plane/src/registry.ts`
- Create: `packages/control-plane/src/index.ts`
- Test: `packages/control-plane/test/registry.test.ts`

**Step 1: Write failing registry tests**

Assert that:

- Exactly seven Agent definitions exist.
- IDs are unique.
- Only the orchestrator may have `role: "orchestrator"`.
- The three Qimen Agents share `calculationCore: "qimen-core"` but have distinct capabilities and memory requirements.
- Meihua is registered as unavailable until verified.
- No Agent can request every memory scope.

```ts
expect(agentRegistry.map((agent) => agent.id)).toEqual([
  "orchestrator",
  "qimen-rhythm",
  "qimen-query",
  "ziwei-timeline",
  "bazi-profile",
  "qimen-finance",
  "meihua"
]);
```

**Step 2: Verify the tests fail**

Run: `npm test -- --run packages/control-plane/test/registry.test.ts`

Expected: FAIL because the registry does not exist.

**Step 3: Implement the registry**

Each immutable definition declares:

```ts
interface AgentDefinition {
  id: AgentId;
  role: "orchestrator" | "domain";
  capabilities: IntentCategory[];
  timeGranularities: TimeGranularity[];
  calculationCore: string | null;
  requiredProfileScopes: ProfileScope[];
  optionalProfileScopes: ProfileScope[];
  allowedMemoryScopes: MemoryScope[];
  availability: "available" | "unverified";
}
```

The control plane is `available`. All domain Agents remain `unverified` until their calculator and golden cases exist.

**Step 4: Verify and commit**

Run: `npm test && npm run typecheck`

Expected: PASS.

```bash
git add -- packages/control-plane
git commit -m "feat: register isolated domain agents"
```

### Task 4: Enforce context and memory gates

**Files:**

- Create: `packages/control-plane/src/policy.ts`
- Modify: `packages/control-plane/src/index.ts`
- Test: `packages/control-plane/test/policy.test.ts`

**Step 1: Write failing policy tests**

Cover:

- Qimen Finance may read `finance` only when explicitly granted.
- Bazi Profile may read birth profile only when granted for this request.
- Qimen Rhythm cannot read relationship or finance memory.
- No report is persisted when the disposition is `once`.
- `save_timeline`, `bookmark`, and `add_note` produce explicit allowed write operations.
- An Agent cannot expand its own permissions.

```ts
expect(
  authorizeContext({
    agentId: "qimen-finance",
    requestedScopes: ["finance"],
    grantedScopes: []
  })
).toEqual({ allowed: [], denied: ["finance"] });
```

**Step 2: Verify the tests fail**

Run: `npm test -- --run packages/control-plane/test/policy.test.ts`

Expected: FAIL because the policy functions do not exist.

**Step 3: Implement pure policy functions**

Implement `authorizeContext`, `authorizePersistence`, and `assertAgentScope`. These functions receive plain validated data and have no file-system or database side effects.

**Step 4: Verify and commit**

Run: `npm test && npm run typecheck`

Expected: PASS.

```bash
git add -- packages/control-plane/src/policy.ts packages/control-plane/src/index.ts packages/control-plane/test/policy.test.ts
git commit -m "feat: enforce context and memory gates"
```

### Task 5: Route requests without flattening user intent

**Files:**

- Create: `packages/control-plane/src/router.ts`
- Modify: `packages/control-plane/src/index.ts`
- Test: `packages/control-plane/test/router.test.ts`

**Step 1: Write failing routing tests**

Test at least:

- Current period -> Qimen Rhythm primary.
- A specific relationship or career question -> Qimen Query primary.
- Calendar life-stage query -> Ziwei Timeline primary.
- Four-pillar profile query -> Bazi Profile primary.
- Stock or market question -> Qimen Finance primary.
- Explicit Agent selection wins when the selected Agent supports the intent.
- A finance request can suggest Bazi and Ziwei as optional support but cannot silently add them.
- An unavailable Agent is returned as `unavailable`, not silently replaced.
- Missing ticker or investment horizon produces one ordered clarification at a time.

```ts
expect(routeRequest(financeRequest)).toMatchObject({
  primaryAgentId: "qimen-finance",
  supportingAgentIds: [],
  optionalAgentIds: ["bazi-profile", "ziwei-timeline"],
  requiredInputs: ["instrument"]
});
```

**Step 2: Verify the tests fail**

Run: `npm test -- --run packages/control-plane/test/router.test.ts`

Expected: FAIL.

**Step 3: Implement deterministic routing**

Use a small ordered decision table. Do not add an LLM, scoring framework, plugin system, or generic rules DSL in this task. Return the reason for every selected or suggested Agent.

**Step 4: Verify and commit**

Run: `npm test && npm run typecheck`

Expected: PASS.

```bash
git add -- packages/control-plane/src/router.ts packages/control-plane/src/index.ts packages/control-plane/test/router.test.ts
git commit -m "feat: route requests to primary agents"
```

### Task 6: Preserve evidence and cross-Agent conflicts

**Files:**

- Create: `packages/control-plane/src/presenter.ts`
- Modify: `packages/control-plane/src/index.ts`
- Test: `packages/control-plane/test/presenter.test.ts`

**Step 1: Write failing presentation tests**

Assert that:

- The primary Agent's conclusion remains primary.
- Supporting reports are retained separately with their Agent IDs.
- Opposing conclusions produce `relationship: "conflict"` and do not become `mixed` inside a fabricated total score.
- An unsupported supporting Agent does not invalidate a complete primary report.
- An unsupported primary Agent produces no favorable, caution, direction, or action text.
- Every displayed claim retains evidence references.

**Step 2: Verify failure**

Run: `npm test -- --run packages/control-plane/test/presenter.test.ts`

Expected: FAIL.

**Step 3: Implement the minimum presenter**

Return:

```ts
interface PresentedResult {
  primary: AgentReport;
  supporting: AgentReport[];
  relationships: Array<{
    agentId: AgentId;
    relationship: "supports" | "modifies" | "conflict" | "unavailable";
    evidenceIds: string[];
  }>;
  overallStatus: "complete" | "needs_input" | "unsupported" | "error";
}
```

The presenter compares structured tendencies and conflict declarations only. It does not infer new divination claims.

**Step 4: Verify and commit**

Run: `npm test && npm run typecheck`

Expected: PASS.

```bash
git add -- packages/control-plane/src/presenter.ts packages/control-plane/src/index.ts packages/control-plane/test/presenter.test.ts
git commit -m "feat: preserve multi-agent conflicts"
```

### Task 7: Add explicit domain Agent adapters

**Files:**

- Create: `packages/agents/package.json`
- Create: `packages/agents/tsconfig.json`
- Create: `packages/agents/src/types.ts`
- Create: `packages/agents/src/unsupported-agent.ts`
- Create: `packages/agents/src/index.ts`
- Test: `packages/agents/test/unsupported-agent.test.ts`

**Step 1: Write the failing adapter test**

For every unverified domain Agent, assert that execution returns:

- Its exact Agent ID and version.
- `status: "unsupported"`.
- No conclusion and no invented evidence.
- A stable reason code such as `CALCULATOR_NOT_VERIFIED`.
- The calculator or golden-case prerequisite needed to enable it.

**Step 2: Verify failure**

Run: `npm test -- --run packages/agents/test/unsupported-agent.test.ts`

Expected: FAIL.

**Step 3: Implement the adapter contract**

```ts
export interface DomainAgent {
  readonly definition: AgentDefinition;
  execute(request: AgentRequest, context: AuthorizedContext): Promise<AgentReport>;
}
```

Do not create mock favorable or caution text. Test-only fake Agents belong inside test files.

**Step 4: Verify and commit**

Run: `npm test && npm run typecheck`

Expected: PASS.

```bash
git add -- packages/agents
git commit -m "feat: add honest domain agent adapters"
```

### Task 8: Run one end-to-end orchestration slice

**Files:**

- Create: `packages/control-plane/src/orchestrator.ts`
- Modify: `packages/control-plane/src/index.ts`
- Create: `tests/e2e/orchestration.test.ts`

**Step 1: Write failing end-to-end tests**

Cover these complete flows:

1. A current-period request routes to Qimen Rhythm and honestly returns unsupported.
2. A finance request missing the instrument asks only for the instrument first.
3. A complete finance request suggests optional Bazi/Ziwei but does not read profile data without grants.
4. Test-only primary and supporting Agents can return contradictory evidence, and the final result keeps both reports plus a conflict marker.
5. `disposition: "once"` emits no persistence operation.

**Step 2: Verify failure**

Run: `npm test -- --run tests/e2e/orchestration.test.ts`

Expected: FAIL because the orchestrator does not exist.

**Step 3: Implement orchestration order**

```text
validate request
-> route
-> return one clarification when required
-> authorize minimum context
-> execute primary
-> execute only explicitly enabled supporting Agents
-> validate reports
-> inspect conflicts and present
-> authorize requested persistence
-> return audit metadata
```

The orchestrator must accept a clock dependency so tests do not rely on the wall clock.

**Step 4: Run full verification**

Run: `npm test`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `git diff --check`

Expected: no output.

**Step 5: Commit**

```bash
git add -- packages/control-plane tests/e2e/orchestration.test.ts
git commit -m "feat: orchestrate isolated agent reports"
```

### Task 9: Document contracts and the next calculator gate

**Files:**

- Create: `docs/architecture/trusted-control-plane.md`
- Create: `docs/rules/conventions.md`
- Create: `docs/testing/real-case-acceptance.md`
- Modify: `README.md`

**Step 1: Document only implemented behavior**

Include:

- Seven-Agent table and current availability.
- Routing and memory authorization examples.
- Explanation of `unsupported` versus `insufficient`.
- The exact evidence required before changing an Agent to available.
- The unresolved time, day-boundary, solar-term, Dun/Ju, useful-god, Ziwei, and Bazi conventions.

**Step 2: Define real-case acceptance fields**

The final personal test requires:

- Gregorian birth date.
- Birth time and stated precision.
- Birth location.
- Timezone at birth.
- Target calculation date, time, location, and timezone.
- Requested module or question.

The process first runs fixed golden cases, then the user-provided case. Never derive golden expectations from the implementation under test.

**Step 3: Verify documentation status**

Run: `rg -n "available|unverified|unsupported" README.md docs/architecture docs/rules docs/testing`

Expected: all six domain Agents remain clearly marked unverified until calculators and golden cases are merged.

Run: `git diff --check`

Expected: no output.

**Step 4: Commit**

```bash
git add -- README.md docs/architecture docs/rules docs/testing
git commit -m "docs: define calculator verification gates"
```

### Task 10: Integrate the verified foundation

**Files:**

- No new files.

**Step 1: Run clean verification from the worktree root**

Run: `npm ci`

Expected: dependencies install from the committed lock file.

Run: `npm test && npm run typecheck && git diff --check`

Expected: all commands PASS and the worktree is clean.

**Step 2: Review the commit range**

Run: `git log --oneline main..codex/multi-agent-foundation`

Expected: small, task-scoped commits in the order above.

Run: `git diff --stat main...codex/multi-agent-foundation`

Expected: only workspace, contracts, control plane, Agent adapters, tests, and documentation.

**Step 3: Merge into main and push**

Merge only after verification. Push `main` to `origin`. Do not add `reference materials/`, private user data, audio, or runtime state.

**Step 4: Record the next milestone**

The next implementation plan starts `time-core` and `qimen-core` only after `docs/rules/conventions.md` decisions and manually verified Qimen golden cases are available.
