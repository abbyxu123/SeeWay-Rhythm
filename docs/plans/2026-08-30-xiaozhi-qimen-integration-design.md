# XiaoZhi Qimen Integration Design

## Goal

Turn the ESP32-S3-RLCD-4.2 into one coherent product: an always-on current
Qimen summary, an evidence-bearing chart detail view, a button-activated
XiaoZhi character that explains the verified chart in plain language, and an
on-demand Qimen market mode.

## Product Principles

1. The ambient screen and chart detail always default to the current shichen.
2. The device runs one integrated firmware image. Stock XiaoZhi and SeeWay are
   not flashed as independent images on top of one another.
3. The Qimen calculator and verifier remain the source of chart facts and
   derived guidance. The language model may classify, retrieve, explain, and
   converse, but it may not replace a missing verified chart with invented
   facts.
4. Raw reference PDFs are research sources. Only rules with a stable rule ID,
   source locator, executable condition, and regression case can produce a
   definitive device conclusion.
5. The current Arduino firmware remains a recoverable baseline until the new
   ESP-IDF firmware passes display, audio, network, and power tests.

## Context Isolation And Interoperation

The product has three cooperating domains with explicit boundaries:

- Personal Qimen owns profiles, runtime location, target time, verified
  personal chart, and personal guidance.
- Qimen Market owns market, instrument, exchange timezone, observation time,
  market method, verified market chart, and market interpretation.
- XiaoZhi owns conversation state and tool routing. It does not own a chart
  calculator and cannot turn conversation memory into chart facts.

Each cross-domain request is decomposed before analysis. For example, a
question about whether the user should act on a particular instrument receives
one personal result and one market result, each with its own chart hash,
verification status, rule IDs, and validity window. XiaoZhi may compare and
translate those labeled results, but it cannot merge them into a third chart.

General wellbeing questions are limited to traditional lifestyle, rest,
attention, and travel language. The product does not infer disease, diagnose,
recommend treatment, or revive the previously excluded medical module.

## Firmware Strategy

Use XiaoZhi `v2.4.2` and its exact `waveshare-esp32-s3-rlcd-4.2` board support
as the hardware reference. Build a distinct board identity named
`seeway-rhythm-rlcd-4.2` so upstream OTA cannot replace the custom firmware.
Pin the upstream repository, release, commit, and artifact checksum in a
machine-readable lock file. Keep SeeWay-owned board glue, screens, MCP tools,
and protocol adapters in separate directories.

The first integrated build uses push-to-talk. Wake-word operation remains a
later option after capture, playback, interruption, AEC, and power behavior are
stable on the real board.

## Screen Hierarchy

### Ambient Summary

- Solar/lunar date, weekday, four pillars, and current shichen.
- A thin twelve-shichen strip with the current branch inverted.
- A separate one-line `本时主势` conclusion. It describes the current
  two-hour period and must never be presented as a whole-day forecast.
- `宜做`, `慎防`, `吉方`, and `行动` as concise, evidence-derived text.
- `吉方` combines direction and purpose instead of showing a direction with
  no practical context.
- One optional focus line for a selected topic or recent voice question.
- No RTC, GPIO count, build version, or raw synchronization diagnostics.

Developer diagnostics remain available through serial `STATUS` and a hidden
service mode. User-facing failures use plain states such as `正在同步` and
`暂无法更新`.

### Chart Detail

The upper portion renders the complete nine-palace chart with a compact line
for time, shichen, solar term, four pillars, dun type, and Ju. A fixed lower
panel explains information intentionally abbreviated on the ambient screen.
It has four pages:

1. `盘面骨架`: chief star, chief gate, xun head, Ju, void, and horse.
2. `判断依据`: the palace, gate, star, deity, stem, and rule IDs supporting
   the current conclusion.
3. `白话释义`: the practical meaning of the strongest combinations.
4. `问事细解`: the active work, finance, travel, communication, study, or
   other supported question interpretation.

The chart stays visible while short presses cycle pages `1/4` through `4/4`.
The lower panel expands the evidence and must not copy the ambient four rows.
A long press returns to the ambient screen.

### XiaoZhi Character

The voice button opens a full character mode instead of a text-only voice
overlay. The character has explicit states for idle, blink, listening,
thinking, speaking, positive confirmation, serious caution, and muted or
offline operation. The screen shows a compact transcript and at most two lines
of the answer while speech is played. It then returns to the current shichen
screen.

Animations use aligned monochrome sprites or layered facial parts, not a video
decoder. Blink timing can be procedural, thinking alternates two frames, and
speaking alternates mouth frames according to playback state. Animation is
limited to the character region and is validated on the physical RLCD before
any frame-rate promise is made.

The first asset gate requires one high-resolution master character on a
transparent background. After it passes a 400 x 300 monochrome legibility
preview, the approved production set contains aligned states for idle-open,
idle-blink, listening, thinking-a, thinking-b, speaking-closed,
speaking-open, positive, caution, and muted-error. Layered source files are
preferred; ten same-canvas PNG files are the fallback.

## Button Contract

- `PWR`: hardware power only.
- `BOOT` (`GPIO0`): the chart button. A long press after boot enters or leaves
  chart detail; a short press inside chart detail advances the lower page.
  Holding BOOT during power-on remains the firmware download gesture.
- `KEY` (`GPIO18`): the XiaoZhi button. A short press starts listening or
  interrupts an active response; a long press toggles microphone privacy mute.

Product copy and test instructions use `BOOT`, `PWR`, and `KEY`, never left or
right, because physical orientation has already caused ambiguous reports.

## Qimen Market Mode

Market mode is the product surface for the independent Qimen Market Agent. It
is not permanently mixed into the personal ambient screen. The user enters it
from the WeChat mini program or by asking XiaoZhi to open market observation.
During a configured trading session it may become the device's selected
always-on mode; after the session it returns to personal current-shichen mode.

The market screen contains:

- selected market, instrument, timezone, and calculation time;
- method and verification status;
- `市场节奏`, `观察窗口`, `风险信号`, and `操作纪律`;
- validity window, evidence IDs, and a clear research/entertainment boundary.

The market Agent has its own input contract, calculator adapter, verifier,
rules, golden cases, and presenter. It may reuse shared calendar and Qimen
facts, but it cannot silently mix a personal birth profile into market facts.
A personal decision overlay is optional and explicitly labeled.

Stock-market and lottery source materials are separate candidate rule sets.
Neither becomes executable merely because a PDF is present. A rule enters the
product only after its input semantics, time basis, derivation, source locator,
and expected cases are encoded and independently reviewed. Lottery output is
never substituted for a stock-market conclusion.

## Voice Data Flow

1. The device captures audio and sends it through the XiaoZhi transport.
2. Speech recognition produces a transcript.
3. The router classifies it as a general question, a personal Qimen topic such
   as work, travel, communication, or study, or an explicit market request.
4. A Qimen question carries the active profile reference, current location and
   time policy, verified chart hash, question category, and transcript.
5. The control plane recomputes or loads the exact chart and requires verifier
   status `verified` before deriving guidance.
6. For a cross-domain question, the orchestrator keeps personal and market
   results in separate envelopes and records which result supports each claim.
7. The response layer receives structured facts and cited evidence, then
   produces `shortDisplay`, `spokenAnswer`, and evidence IDs.
8. The device speaks the answer, shows the short version, and returns to idle.

If no verified chart is available, the assistant says that the chart is still
synchronizing. It does not improvise a Qimen answer. General assistant
questions remain available without claiming a Qimen basis.

## Data And Privacy

- Birth profile and current location are separate concepts.
- The phone remains the primary place to create profiles, choose the active
  person, set runtime location, and review full explanations.
- Audio is transient by default. Conversation history is stored only when the
  user enables it.
- The device receives bounded current context rather than the full PDF corpus.
- API credentials remain in the service layer, not in distributable firmware.

## WeChat Mini Program Boundary

The mini program is reserved now through shared contracts and a separate app
directory. Its primary areas are `当前`, `今日`, `问事`, `市场`, `人物`, `日历`,
and `设备`. `今日` is computed by evaluating and aggregating the day's twelve
shichen; it must not relabel the current chart as a whole-day result.

Bluetooth is used only for first-time provisioning, nearby pairing, and
recovery when appropriate. Normal profile, chart, market, and question data
synchronizes through the service layer over Wi-Fi so the phone does not need to
remain continuously connected to the board.

## Safe Flashing Policy

Before any XiaoZhi-derived image is flashed, capture the complete 16 MB flash,
NVS-related partitions, current binaries, partition table, serial port, board
MAC, and restore command. Verify the candidate image is for the exact board,
chip, flash/PSRAM layout, display, and audio codec. Use the package-provided
flash offsets or a verified merged image; never guess an offset from the file
name.

## Acceptance Criteria

- The current SeeWay firmware can be restored byte-for-byte.
- The custom image has a unique board and OTA identity.
- Current-shichen summary and chart detail agree on chart hash and selection.
- The ambient screen uses `本时主势`, `宜做`, `慎防`, `吉方`, and `行动`, and
  never labels a single shichen chart as the whole day.
- The chart detail lower panel contains evidence-derived expansion, not a copy
  of the ambient keywords.
- The BOOT/PWR/KEY mapping is stable in code, documentation, and hardware logs.
- The XiaoZhi character remains recognizable in the real 400 x 300 monochrome
  layout and every animation state can fall back to a static frame.
- Voice capture, stop, interruption, playback, reconnect, and microphone mute
  work on the physical board.
- A Qimen voice answer is blocked whenever chart verification is not
  `verified`.
- Cross-domain voice answers retain separate personal and market chart hashes,
  and every synthesized claim identifies which domain supports it.
- The device returns to the current-shichen ambient screen after every voice
  interaction and reboot.
- Market mode can be entered and exited without changing the personal chart,
  and no unverified market conclusion reaches the display or speech layer.
- Mini-program and device fixtures validate against the same versioned profile,
  chart, question, market, and synchronization contracts.
