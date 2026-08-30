# XiaoZhi Qimen Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a recoverable, uniquely identified XiaoZhi-derived firmware that preserves the verified SeeWay Qimen experience, adds a dynamic character and button-driven voice questions, exposes an independent Qimen market mode, and shares contracts with a reserved WeChat mini program.

**Architecture:** Preserve the current Arduino image as the recovery baseline while introducing an ESP-IDF XiaoZhi integration rooted in the exact Waveshare RLCD board support. Keep firmware board glue, SeeWay screens, voice contracts, and host-side Qimen orchestration independently testable, and do not flash the custom image until backup and restore artifacts are verified.

**Tech Stack:** TypeScript 5.9, Vitest, ESP-IDF 6.0.2, XiaoZhi v2.4.2, ESP32-S3 N16R8, ST7305, ES7210, ES8311, MCP, WebSocket or MQTT/UDP.

---

### Task 1: Pin The Upstream Firmware Reference

**Files:**
- Create: `firmware/xiaozhi-seeway/upstream.lock.json`
- Create: `firmware/xiaozhi-seeway/README.md`
- Create: `tests/xiaozhi-upstream-lock.test.ts`

**Steps:**
1. Write a failing schema test requiring the official repository URL, release,
   exact commit, board ID, ESP-IDF version, license, and SHA-256 fields.
2. Run `npm test -- tests/xiaozhi-upstream-lock.test.ts` and confirm RED.
3. Add the reviewed v2.4.2 metadata for
   `waveshare-esp32-s3-rlcd-4.2`.
4. Run the focused test and confirm GREEN.
5. Document that the stock package is reference/recovery material and must not
   be flashed over SeeWay without the backup gate.

### Task 2: Capture A Restorable Device Backup

**Files:**
- Create: `scripts/device/backup-esp32-s3-rlcd42.sh`
- Create: `scripts/device/verify-esp32-backup.sh`
- Create: `firmware/esp32-s3-rlcd-4.2-smoke-test/RECOVERY.md`
- Test: `tests/device-backup-scripts.test.ts`

**Steps:**
1. Write static tests requiring exact 16 MB read size, explicit serial port,
   chip identity check, SHA-256 manifest, and a non-destructive default mode.
2. Run the focused test and confirm RED.
3. Implement backup and manifest verification scripts without embedding a
   machine-specific serial port.
4. Run the focused test and shell syntax checks.
5. Back up `/dev/cu.usbmodem101`, record MAC and partition information, and
   verify the backup hash before any new flash.
6. Perform a dry-run restore command inspection and stop for the safety
   checkpoint.

### Task 3: Define The Voice Question Contract

**Files:**
- Create: `packages/contracts/src/voice.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/test/voice.test.ts`

**Steps:**
1. Write failing tests for transcript, topic, profile reference, runtime
   location, target time, chart hash, verification status, short display,
   spoken answer, and evidence IDs.
2. Require `verified` for any response claiming a Qimen basis.
3. Run the focused test and confirm RED.
4. Implement strict Zod schemas with bounded strings and explicit general vs
   Qimen response variants.
5. Run focused tests, full tests, and typecheck.

### Task 4: Add Deterministic Question Routing

**Files:**
- Create: `packages/control-plane/src/voice-router.ts`
- Modify: `packages/control-plane/src/index.ts`
- Create: `packages/control-plane/test/voice-router.test.ts`

**Steps:**
1. Write failing tests for work, travel, communication, study, explicit market
   requests, and general questions.
2. Add ambiguous-question handling that requests clarification rather than
   guessing a topic.
3. Prove unverified or mismatched chart hashes cannot reach Qimen narration.
4. Implement the minimal router and run focused tests.
5. Run full tests and typecheck.

### Task 5: Add Isolated Cross-Domain Conversation Envelopes

**Files:**
- Create: `packages/contracts/src/conversation-context.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/test/conversation-context.test.ts`
- Create: `packages/control-plane/src/context-orchestrator.ts`
- Create: `packages/control-plane/test/context-orchestrator.test.ts`

**Steps:**
1. Write failing tests for personal-only, market-only, general-chat, and
   personal-plus-market requests.
2. Require separate profile/chart references, hashes, verifier reports,
   validity windows, and evidence arrays for every included domain.
3. Prove the synthesizer cannot construct a replacement chart or cite
   conversation memory as chart evidence.
4. Add claim-level domain attribution and reject a cross-domain response when
   either required result is missing or stale.
5. Add a wellbeing boundary that allows general rest, attention, and travel
   language but blocks diagnosis, disease inference, and treatment claims.
6. Run focused tests, full tests, and typecheck.

### Task 6: Create The Custom XiaoZhi Board Overlay

**Files:**
- Create: `firmware/xiaozhi-seeway/overlay/main/boards/waveshare/seeway-rhythm-rlcd-4.2/`
- Create: `firmware/xiaozhi-seeway/overlay/main/seeway/`
- Create: `firmware/xiaozhi-seeway/scripts/prepare-upstream.sh`
- Create: `firmware/xiaozhi-seeway/scripts/build.sh`
- Test: `tests/xiaozhi-overlay.test.ts`

**Steps:**
1. Write failing tests for unique board identity, exact N16R8 configuration,
   GPIO mapping, ST7305 dimensions, ES7210/ES8311 audio, and isolated OTA name.
2. Add a pinned, reproducible upstream preparation step that refuses a commit
   mismatch.
3. Add the custom board files without editing the stock board identity.
4. Build the exact variant with ESP-IDF 6.0.2.
5. Record binary sizes, partition table, and hashes; do not flash yet.

### Task 7: Port The SeeWay Screen State Machine

**Files:**
- Create: `firmware/xiaozhi-seeway/overlay/main/seeway/seeway_screen_state.*`
- Create: `firmware/xiaozhi-seeway/overlay/main/seeway/seeway_display.*`
- Create: `firmware/xiaozhi-seeway/host-tests/screen_state_test.cpp`
- Test: `tests/xiaozhi-screen-state.test.ts`

**Steps:**
1. Write host tests for ambient, chart detail, four-page detail pagination,
   listening, thinking, speaking, market mode, error, and return-to-current
   behavior.
2. Implement a pure state machine before display drawing.
3. Remove user-visible RTC/GPIO/version diagnostics and preserve them in serial
   status only.
4. Draw the twelve-shichen strip, `本时主势`, `宜做`, `慎防`, `吉方`, `行动`,
   full chart, and the four-page evidence-expansion panel below the chart.
5. Compile and verify no user state can leave the device on a stale shichen.

### Task 8: Add The XiaoZhi Character Asset Pipeline

**Files:**
- Create: `firmware/xiaozhi-seeway/assets/xiaozhi/manifest.json`
- Create: `firmware/xiaozhi-seeway/scripts/prepare-character-assets.ts`
- Create: `firmware/xiaozhi-seeway/overlay/main/seeway/seeway_character.*`
- Create: `tests/xiaozhi-character-assets.test.ts`

**Steps:**
1. Write failing tests requiring a master source, transparent background,
   identical canvas and anchor point, approved state names, dimensions, and
   generated monochrome hashes.
2. Add a preview-only conversion that renders all states into a 400 x 300
   contact sheet without modifying the source artwork.
3. Stop at the asset review gate and request the master character image.
4. Generate packed sprites only after the monochrome preview is approved.
5. Implement deterministic idle blink, thinking, speaking, positive, caution,
   and muted/offline transitions with a static-frame fallback.
6. Run the focused tests and record Flash and PSRAM use.

### Task 9: Bind Buttons And Audio States

**Files:**
- Create: `firmware/xiaozhi-seeway/overlay/main/seeway/seeway_buttons.*`
- Modify: custom board implementation from Task 5.
- Extend: `firmware/xiaozhi-seeway/host-tests/screen_state_test.cpp`

**Steps:**
1. Test the exact short/long-press contract for `BOOT` and `KEY`.
2. Bind PWR to no application action.
3. Bind KEY short press to XiaoZhi listen/interrupt and KEY long press to
   privacy mute.
4. Bind BOOT long press after startup to chart enter/leave and BOOT short press
   inside chart detail to page advancement.
5. Build and inspect GPIO logs before physical audio testing.

### Task 10: Connect XiaoZhi To Verified Qimen Context

**Files:**
- Create: `packages/control-plane/src/voice-service.ts`
- Create: `packages/control-plane/test/voice-service.test.ts`
- Create: `firmware/xiaozhi-seeway/overlay/main/seeway/seeway_mcp_tools.*`
- Create: `docs/protocols/voice-qimen-flow.md`

**Steps:**
1. Write an end-to-end failing test from transcript to verified response.
2. Add MCP tools for current context, question submission, response status,
   and cancellation.
3. Reuse the existing Qimen calculator, independent verifier, guidance engine,
   profile store, and evidence IDs.
4. Block Qimen narration on missing profile, location, payload, verification,
   or chart-hash mismatch.
5. Run focused tests, full tests, typecheck, and protocol fixture validation.

### Task 11: Build The Independent Qimen Market Mode

**Files:**
- Create: `packages/contracts/src/market.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/test/market.test.ts`
- Create: `packages/agents/src/qimen-market-agent.ts`
- Modify: `packages/agents/src/index.ts`
- Create: `packages/agents/test/qimen-market-agent.test.ts`
- Create: `packages/control-plane/src/market-service.ts`
- Create: `packages/control-plane/test/market-service.test.ts`
- Create: `docs/protocols/qimen-market-flow.md`

**Steps:**
1. Write failing contracts for market, instrument, exchange timezone,
   observation time, method version, chart hash, verification, validity window,
   evidence, market rhythm, observation window, risk signal, and discipline.
2. Prove that a birth profile cannot silently alter market chart facts and that
   an optional personal overlay is explicit and separately hashed.
3. Add the Agent boundary and keep unsupported source rules unavailable rather
   than filling them with language-model output.
4. Register `月家奇门股市用法经验 .pdf` as a stock-market candidate source and
   `《天机推演图》奇门测彩票 .pdf` as a separate lottery candidate source; do not
   allow either source name alone to activate a rule.
5. Add golden fixtures only after each stock-market rule has a stable rule ID,
   source locator, executable condition, and reviewed expected result.
6. Route explicit XiaoZhi market requests to this Agent and block ambiguous
   financial questions pending clarification.
7. Run focused tests, full tests, and typecheck.

### Task 12: Reserve The WeChat Mini Program And Sync Contracts

**Files:**
- Create: `apps/wechat-mini-program/README.md`
- Create: `apps/wechat-mini-program/app.json`
- Create: `apps/wechat-mini-program/src/shared/contracts.ts`
- Create: `apps/wechat-mini-program/src/pages/device-pairing/`
- Create: `apps/wechat-mini-program/src/pages/current/`
- Create: `apps/wechat-mini-program/src/pages/today/`
- Create: `apps/wechat-mini-program/src/pages/question/`
- Create: `apps/wechat-mini-program/src/pages/market/`
- Create: `apps/wechat-mini-program/src/pages/profiles/`
- Create: `tests/wechat-mini-program-contracts.test.ts`

**Steps:**
1. Write failing tests proving device and mini-program fixtures use the same
   versioned profile, current chart, voice question, market, and sync schemas.
2. Add a minimal navigation shell for current, today, question, market,
   profiles, calendar, and device areas without implementing payment.
3. Keep BLE responsibilities limited to provisioning, pairing, and recovery;
   define service-mediated Wi-Fi synchronization for normal use.
4. Prove `今日` requires twelve-shichen aggregation and rejects a single
   current-shichen payload mislabeled as a whole-day summary.
5. Run contract tests and typecheck; defer visual polish until the hardware
   synchronization path is real.

### Task 13: Flash And Verify The Integrated Firmware

**Files:**
- Modify: `firmware/xiaozhi-seeway/README.md`
- Create: `docs/checklists/xiaozhi-rlcd42-hardware-checklist.md`

**Steps:**
1. Verify the recovery image and restore command again.
2. Flash only the custom `seeway-rhythm-rlcd-4.2` image with reviewed offsets.
3. Verify display, current shichen, four chart-detail pages, BOOT/KEY/PWR,
   XiaoZhi character states, power behavior, Wi-Fi provisioning, microphone
   capture, AEC, speaker output, interruption, reconnect, and privacy mute.
4. Ask one Qimen question and verify the displayed chart hash and evidence IDs
   match the host response.
5. Enter and leave market mode and prove it does not mutate the personal chart
   or narrate an unverified market conclusion.
6. Power-cycle and verify the device returns to the current ambient summary.
7. Stop for the hardware acceptance review before adding wake word or OTA.
