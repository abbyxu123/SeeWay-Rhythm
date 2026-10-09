#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(readFileSync(resolve(root, "upstream.lock.json"), "utf8"));
const prepared = process.env.XIAOZHI_PREPARED_SOURCE ?? resolve(root, ".work", "upstream-" + lock.commit);
const font = resolve(prepared, "managed_components/lvgl__lvgl/scripts/built_in_font/SourceHanSansSC-Normal.otf");
const converter = resolve(root, ".tools/node_modules/.bin/lv_font_conv");
const converterPackage = JSON.parse(readFileSync(resolve(root, ".tools/node_modules/lv_font_conv/package.json"), "utf8"));
if (converterPackage.version !== "1.5.3") throw new Error("Install lv_font_conv@1.5.3 in .tools");
const output = resolve(root, "overlay/main/seeway/seeway_font_14.c");
const ranges = "0x20-0x7e,0x4e00-0x9fff";
const symbols = "…·°，。！？：；、（）【】《》“”";
execFileSync(converter, ["--size", "14", "--bpp", "1", "--format", "lvgl", "--no-compress", "--no-kerning", "--font", font, "--range", ranges, "--symbols", symbols, "--lv-font-name", "seeway_font_14", "--output", output], {stdio: "inherit"});
// Normalize machine paths in the generated comment, never the glyph data.
const generated = readFileSync(output, "utf8").replace(/^ \* Opts:.*$/m, " * Generator: scripts/prepare-font.mjs (lv_font_conv 1.5.3); license: assets/fonts/OFL.txt");
writeFileSync(output, generated);
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
writeFileSync(resolve(root, "assets/fonts/manifest.json"), JSON.stringify({
  name: "SeeWay Mono 14", generator: "lv_font_conv@1.5.3", size: 14, bpp: 1,
  ranges, symbols, source: "SourceHanSansSC-Normal.otf", license: "OFL-1.1",
  sourceSha256: sha256(readFileSync(font)), generatedSha256: sha256(generated),
  output: "overlay/main/seeway/seeway_font_14.c",
}, null, 2) + "\n");
