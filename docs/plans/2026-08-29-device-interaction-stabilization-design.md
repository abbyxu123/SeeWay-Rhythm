# Device Interaction Stabilization Design

## Scope

This stage stabilizes the existing ESP32-S3-RLCD-4.2 firmware before phone
provisioning is added. It does not change the Qimen calculator, guidance rules,
profile contract, or transport architecture.

## Confirmed Hardware

- BOOT is an active-low application input on GPIO0.
- KEY is an active-low application input on GPIO18.
- PWR is the hardware power controller and is not an application input.

## Root Cause

The firmware stores only the payload generated for the then-current shichen and
the immediately following shichen. If the user was already previewing the next
shichen when the clock crossed a boundary, that preview silently advanced to a
third, uncached shichen. Pressing KEY after the boundary could do the same. The
payload lookup correctly rejected that missing period, but the UI replaced all
derived rows and calendar facts with `未同步`, making a valid current payload
appear lost.

An empty guidance category is a separate, valid state: it means no supported
rule produced evidence for that category. Rendering it as `--` looks broken and
does not explain the distinction between no conclusion and no synchronization.

## Behavior

1. A shichen boundary always resets a preview to the current shichen.
2. KEY may enter next-shichen preview only when that exact payload is cached.
3. If the next payload is absent, the current verified screen remains visible
   and a short notice says that the next shichen has not synchronized.
4. Empty verified categories use category-specific text such as
   `暂无明确有利项`; they never receive invented guidance.
5. `STATUS` reports selection, view, raw pin levels, debounced press counts, and
   current/next payload availability so physical input faults can be separated
   from missing-data behavior.

## Verification

- Host C++ tests cover boundary normalization, guarded preview selection, and
  empty-category wording using the same header included by the firmware.
- The complete TypeScript test suite and typecheck remain green.
- Arduino compilation proves the production sketch accepts the shared policy.
- The flashed board must report GPIO0/GPIO18 diagnostics and keep a verified
  current screen visible when a future payload is unavailable.
