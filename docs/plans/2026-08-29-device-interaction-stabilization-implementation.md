# Device Interaction Stabilization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep the verified current Qimen screen stable across shichen boundaries and unavailable previews while making both application buttons diagnosable.

**Architecture:** Put the input-independent selection policy and empty-category wording in a small C++ header shared by host tests and the Arduino sketch. Keep hardware sampling, payload lookup, drawing, and serial I/O in the existing sketch, but expose enough state through `STATUS` to diagnose GPIO0 and GPIO18 on the physical board.

**Tech Stack:** C++17 host tests, Arduino ESP32 3.3.11, U8g2, Vitest, TypeScript 5.9.

---

### Task 1: Lock the interaction policy with failing tests

**Files:**
- Create: `firmware/esp32-s3-rlcd-4.2-smoke-test/test/interaction_policy_test.cpp`
- Create: `tests/firmware-interaction.test.ts`

**Steps:**
1. Write host assertions for boundary reset, missing-next rejection, successful preview, and category-specific empty text.
2. Run `npm test -- tests/firmware-interaction.test.ts`.
3. Confirm RED because `InteractionPolicy.h` does not exist.

### Task 2: Implement and integrate the policy

**Files:**
- Create: `firmware/esp32-s3-rlcd-4.2-smoke-test/SeeWay_RLCD42_Smoke/InteractionPolicy.h`
- Modify: `firmware/esp32-s3-rlcd-4.2-smoke-test/SeeWay_RLCD42_Smoke/SeeWay_RLCD42_Smoke.ino`

**Steps:**
1. Add pure policy functions with no Arduino dependency.
2. Include the policy in the firmware.
3. Reset preview when the current shichen token changes.
4. Reject a KEY transition to an uncached next payload and display a temporary notice.
5. Replace `--` with category-specific empty-result text.
6. Run the focused test and confirm GREEN.

### Task 3: Add observable button diagnostics

**Files:**
- Modify: `firmware/esp32-s3-rlcd-4.2-smoke-test/SeeWay_RLCD42_Smoke/SeeWay_RLCD42_Smoke.ino`
- Modify: `firmware/esp32-s3-rlcd-4.2-smoke-test/README.md`

**Steps:**
1. Extend `STATUS` with selection, view, current/next availability, GPIO levels, and press counts.
2. Document the exact BOOT, PWR, and KEY behavior.
3. Run focused tests, full tests, and typecheck.

### Task 4: Compile, flash, and verify the real board

**Files:**
- No source files beyond Tasks 1-3.

**Steps:**
1. Compile with the pinned Arduino FQBN in the firmware README.
2. Upload to the confirmed SeeWay serial port without erasing NVS.
3. Send `STATUS` and confirm both GPIO diagnostics are present.
4. Exercise current/next and summary/chart through serial commands.
5. Confirm unavailable next selection does not erase the current screen.
6. Stop for the stage review before starting phone provisioning.
