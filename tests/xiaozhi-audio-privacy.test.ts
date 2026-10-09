import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { it, expect } from "vitest";

it("keeps capture disabled until privacy mute is explicitly released", () => {
  const dir = mkdtempSync(join(tmpdir(), "seeway-privacy-"));
  try {
    const source = join(dir, "privacy.cpp");
    const binary = join(dir, "privacy");
    writeFileSync(source, `
#include "seeway_audio_privacy.h"
#include <cassert>
#include <future>
#include <chrono>
using seeway::AudioInputPrivacy;
int main() {
  bool disabled = false;
  std::promise<void> started;
  std::future<void> muted;
  {
    auto active_read = AudioInputPrivacy::AcquireRead();
    assert(active_read.allowed);
    muted = std::async(std::launch::async, [&]() {
      started.set_value();
      AudioInputPrivacy::SetMuted(true, [&] { disabled = true; });
    });
    started.get_future().wait();
    assert(muted.wait_for(std::chrono::milliseconds(10)) == std::future_status::timeout);
  }
  muted.get();
  assert(disabled);
  for (int attempt=0; attempt<100; ++attempt) {
    auto lease = AudioInputPrivacy::AcquireRead();
    assert(!lease.allowed);
  }
  AudioInputPrivacy::SetMuted(false, [] { assert(false); });
  auto resumed = AudioInputPrivacy::AcquireRead();
  assert(resumed.allowed);
}
`);
    execFileSync("c++", ["-std=c++17", "-pthread", "-I", resolve("firmware/xiaozhi-seeway/overlay/main/seeway"), source, "-o", binary]);
    expect(() => execFileSync(binary, [], {timeout: 5000})).not.toThrow();
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});

it("applies the privacy gate to every microphone read on only the SeeWay board", () => {
  const patch = readFileSync("firmware/xiaozhi-seeway/scripts/apply-overlay.py", "utf8");
  const board = readFileSync("firmware/xiaozhi-seeway/overlay/main/boards/seeway/seeway-rhythm-rlcd-4.2/seeway-rhythm-rlcd-4.2.cc", "utf8");
  expect(patch).toContain("seeway::AudioInputPrivacy::AcquireRead()");
  expect(board).toContain("AudioInputPrivacy::SetMuted(true");
  expect(board).toContain("AudioInputPrivacy::SetMuted(false");
});
