import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const firmwareRoot = resolve("firmware/xiaozhi-seeway");
const assetRoot = resolve(firmwareRoot, "assets/xiaozhi");
const seewayRoot = resolve(firmwareRoot, "overlay/main/seeway");
const manifestPath = resolve(assetRoot, "manifest.json");
const approvedStates = [
  "idle-open",
  "idle-blink",
  "listening",
  "thinking-a",
  "thinking-b",
  "speaking-closed",
  "speaking-open",
  "positive",
  "caution",
  "muted-error",
] as const;

describe("SeeWay XiaoZhi character assets", () => {
  it("normalizes transparent sources into one reviewed monochrome canvas", () => {
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      master: { path: string; width: number; height: number; hasAlpha: boolean };
      production: {
        canvas: { width: number; height: number };
        anchor: { x: number; y: number };
        states: Array<{ name: string; source: string }>;
      };
      generated: {
        preview: string;
        previewSha256: string;
        spriteSha256: Record<string, string>;
        spriteBounds: Record<
          string,
          { left: number; top: number; right: number; bottom: number }
        >;
      };
    };

    expect(manifest.master.hasAlpha).toBe(true);
    expect(manifest.master.width).toBeGreaterThanOrEqual(1000);
    expect(manifest.master.height).toBeGreaterThanOrEqual(1000);
    expect(manifest.production.canvas).toEqual({ width: 168, height: 168 });
    expect(manifest.production.anchor).toEqual({ x: 84, y: 159 });
    expect(manifest.production.states.map((state) => state.name)).toEqual(
      approvedStates,
    );
    expect(manifest.generated.preview).toBe("generated/contact-sheet.png");
    expect(manifest.generated.previewSha256).toMatch(/^[a-f0-9]{64}$/);

    for (const state of approvedStates) {
      expect(manifest.generated.spriteSha256[state]).toMatch(/^[a-f0-9]{64}$/);
      const bounds = manifest.generated.spriteBounds[state];
      expect(bounds).toBeDefined();
      expect(bounds!.left).toBeGreaterThanOrEqual(8);
      expect(bounds!.top).toBeGreaterThanOrEqual(8);
      expect(bounds!.right).toBeLessThanOrEqual(159);
      expect(bounds!.bottom).toBeLessThanOrEqual(159);
    }

    execFileSync(
      resolve("node_modules/.bin/vite-node"),
      [
        "--script",
        resolve(firmwareRoot, "scripts/prepare-character-assets.ts"),
        "--check",
      ],
      { stdio: "pipe" },
    );
  });

  it("maps voice states to deterministic character frames with a static fallback", () => {
    const header = readFileSync(resolve(seewayRoot, "seeway_character.h"), "utf8");
    const source = readFileSync(resolve(seewayRoot, "seeway_character.cc"), "utf8");

    for (const state of [
      "Idle",
      "Listening",
      "Thinking",
      "Speaking",
      "Positive",
      "Caution",
      "MutedError",
    ]) {
      expect(header).toContain(state);
    }
    expect(source).toContain("CharacterFrameAt");
    expect(source).toContain("static_fallback");
    expect(source).not.toContain("rand(");
    expect(source).not.toContain("random(");
  });

  it("registers the character runtime in the upstream overlay", () => {
    const patcher = readFileSync(
      resolve(firmwareRoot, "scripts/apply-overlay.py"),
      "utf8",
    );
    const display = readFileSync(resolve(seewayRoot, "seeway_display.cc"), "utf8");

    expect(patcher).toContain("seeway/seeway_character.cc");
    expect(display).toContain('#include "seeway_character.h"');
    expect(display).toContain("CharacterFrameAt");
  });
});
