import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

type RgbaImage = {
  width: number;
  height: number;
  pixels: Uint8Array;
};

type PixelBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type CharacterManifest = {
  schemaVersion: number;
  master: {
    path: string;
    width: number;
    height: number;
    hasAlpha: boolean;
  };
  production: {
    canvas: { width: number; height: number };
    anchor: { x: number; y: number };
    states: Array<{ name: string; source: string }>;
  };
  generated: {
    preview: string;
    previewSha256: string;
    spriteSha256: Record<string, string>;
    spriteBounds?: Record<string, PixelBounds>;
    statePngSha256?: Record<string, string>;
    runtimeIncludeSha256?: string;
  };
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const firmwareRoot = resolve(scriptDirectory, "..");
const assetRoot = join(firmwareRoot, "assets/xiaozhi");
const manifestPath = join(assetRoot, "manifest.json");
const runtimeIncludePath = join(
  firmwareRoot,
  "overlay/main/seeway/seeway_character_assets.inc",
);
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readUInt32(buffer: Uint8Array, offset: number): number {
  return (
    buffer[offset]! * 0x1000000 +
    buffer[offset + 1]! * 0x10000 +
    buffer[offset + 2]! * 0x100 +
    buffer[offset + 3]!
  );
}

function paeth(a: number, b: number, c: number): number {
  const prediction = a + b - c;
  const distanceA = Math.abs(prediction - a);
  const distanceB = Math.abs(prediction - b);
  const distanceC = Math.abs(prediction - c);
  if (distanceA <= distanceB && distanceA <= distanceC) return a;
  if (distanceB <= distanceC) return b;
  return c;
}

function readPng(path: string): RgbaImage {
  const bytes = readFileSync(path);
  if (!bytes.subarray(0, 8).equals(pngSignature)) {
    throw new Error(`Unsupported image signature: ${path}`);
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = -1;
  let palette: Buffer | undefined;
  let transparency: Buffer | undefined;
  const imageData: Buffer[] = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      throw new Error(`Truncated PNG chunk in ${path}`);
    }
    if (type === "IHDR") {
      width = bytes.readUInt32BE(dataStart);
      height = bytes.readUInt32BE(dataStart + 4);
      bitDepth = bytes[dataStart + 8]!;
      colorType = bytes[dataStart + 9]!;
      interlace = bytes[dataStart + 12]!;
    } else if (type === "IDAT") {
      imageData.push(bytes.subarray(dataStart, dataEnd));
    } else if (type === "PLTE") {
      palette = bytes.subarray(dataStart, dataEnd);
    } else if (type === "tRNS") {
      transparency = bytes.subarray(dataStart, dataEnd);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  const channels = colorType === 6 ? 4 : colorType === 4 ? 2 : colorType === 2 ? 3 : colorType === 3 || colorType === 0 ? 1 : 0;
  if (width <= 0 || height <= 0 || bitDepth !== 8 || channels === 0 || interlace !== 0) {
    throw new Error(
      `Only 8-bit non-interlaced indexed, grayscale, RGB, GA, and RGBA PNGs are supported: ${path}`,
    );
  }
  if (colorType === 3 && (palette === undefined || palette.length % 3 !== 0)) {
    throw new Error(`Indexed PNG is missing a valid palette: ${path}`);
  }

  const packed = inflateSync(Buffer.concat(imageData));
  const rowBytes = width * channels;
  if (packed.length !== height * (rowBytes + 1)) {
    throw new Error(`Unexpected PNG scanline size: ${path}`);
  }

  const decoded = new Uint8Array(height * rowBytes);
  let inputOffset = 0;
  for (let y = 0; y < height; y++) {
    const filter = packed[inputOffset++]!;
    const rowOffset = y * rowBytes;
    const previousOffset = (y - 1) * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const raw = packed[inputOffset++]!;
      const left = x >= channels ? decoded[rowOffset + x - channels]! : 0;
      const up = y > 0 ? decoded[previousOffset + x]! : 0;
      const upLeft = y > 0 && x >= channels
        ? decoded[previousOffset + x - channels]!
        : 0;
      let value = raw;
      if (filter === 1) value = (raw + left) & 0xff;
      else if (filter === 2) value = (raw + up) & 0xff;
      else if (filter === 3) value = (raw + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) value = (raw + paeth(left, up, upLeft)) & 0xff;
      else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}: ${path}`);
      decoded[rowOffset + x] = value;
    }
  }

  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    const source = index * channels;
    const target = index * 4;
    if (colorType === 6) {
      pixels[target] = decoded[source]!;
      pixels[target + 1] = decoded[source + 1]!;
      pixels[target + 2] = decoded[source + 2]!;
      pixels[target + 3] = decoded[source + 3]!;
    } else if (colorType === 4) {
      pixels[target] = decoded[source]!;
      pixels[target + 1] = decoded[source]!;
      pixels[target + 2] = decoded[source]!;
      pixels[target + 3] = decoded[source + 1]!;
    } else if (colorType === 3) {
      const paletteIndex = decoded[source]!;
      const paletteOffset = paletteIndex * 3;
      if (palette === undefined || paletteOffset + 2 >= palette.length) {
        throw new Error(`Indexed PNG palette entry is out of range: ${path}`);
      }
      pixels[target] = palette[paletteOffset]!;
      pixels[target + 1] = palette[paletteOffset + 1]!;
      pixels[target + 2] = palette[paletteOffset + 2]!;
      pixels[target + 3] = transparency?.[paletteIndex] ?? 255;
    } else if (colorType === 2) {
      pixels[target] = decoded[source]!;
      pixels[target + 1] = decoded[source + 1]!;
      pixels[target + 2] = decoded[source + 2]!;
      pixels[target + 3] = 255;
    } else {
      pixels[target] = decoded[source]!;
      pixels[target + 1] = decoded[source]!;
      pixels[target + 2] = decoded[source]!;
      pixels[target + 3] = 255;
    }
  }
  return { width, height, pixels };
}

function contentBounds(image: RgbaImage): PixelBounds {
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.pixels[(y * image.width + x) * 4 + 3]! <= 8) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) {
    throw new Error("Character layer has no visible pixels");
  }
  return { left, top, right, bottom };
}

function maskBounds(mask: Uint8Array, width: number, height: number): PixelBounds {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] !== 1) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) {
    throw new Error("Character mask has no visible pixels");
  }
  return { left, top, right, bottom };
}

function sample(image: RgbaImage, x: number, y: number): [number, number, number, number] {
  const clampedX = Math.max(0, Math.min(image.width - 1, x));
  const clampedY = Math.max(0, Math.min(image.height - 1, y));
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(image.width - 1, x0 + 1);
  const y1 = Math.min(image.height - 1, y0 + 1);
  const fx = clampedX - x0;
  const fy = clampedY - y0;
  const output = [0, 0, 0, 0];
  for (let channel = 0; channel < 4; channel++) {
    const p00 = image.pixels[(y0 * image.width + x0) * 4 + channel]!;
    const p10 = image.pixels[(y0 * image.width + x1) * 4 + channel]!;
    const p01 = image.pixels[(y1 * image.width + x0) * 4 + channel]!;
    const p11 = image.pixels[(y1 * image.width + x1) * 4 + channel]!;
    output[channel] = Math.round(
      (p00 * (1 - fx) + p10 * fx) * (1 - fy) +
      (p01 * (1 - fx) + p11 * fx) * fy,
    );
  }
  return output as [number, number, number, number];
}

function drawLayer(
  mask: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  image: RgbaImage,
  maxWidth: number,
  maxHeight: number,
  centerX: number,
  bottomY: number,
  threshold: number,
): void {
  const bounds = contentBounds(image);
  const sourceWidth = bounds.right - bounds.left + 1;
  const sourceHeight = bounds.bottom - bounds.top + 1;
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
  const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
  const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
  const startX = Math.round(centerX - drawWidth / 2);
  const startY = Math.round(bottomY - drawHeight);

  for (let y = 0; y < drawHeight; y++) {
    for (let x = 0; x < drawWidth; x++) {
      const targetX = startX + x;
      const targetY = startY + y;
      if (targetX < 0 || targetX >= canvasWidth || targetY < 0 || targetY >= canvasHeight) continue;
      const sourceX = bounds.left + ((x + 0.5) / drawWidth) * sourceWidth - 0.5;
      const sourceY = bounds.top + ((y + 0.5) / drawHeight) * sourceHeight - 0.5;
      const [red, green, blue, alpha] = sample(image, sourceX, sourceY);
      const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
      const composite = 255 - (alpha / 255) * (255 - luminance);
      if (alpha > 12 && composite < threshold) {
        mask[targetY * canvasWidth + targetX] = 1;
      }
    }
  }
}

function createStateMask(
  master: RgbaImage,
  expression: RgbaImage,
  width: number,
  height: number,
  anchor: { x: number; y: number },
): Uint8Array {
  const mask = new Uint8Array(width * height);
  drawLayer(
    mask,
    width,
    height,
    master,
    Math.max(1, width - 18),
    Math.max(1, height - 18),
    anchor.x,
    anchor.y,
    218,
  );

  const expressionMask = new Uint8Array(width * height);
  drawLayer(
    expressionMask,
    width,
    height,
    expression,
    Math.round(width * 0.6),
    Math.round(height * 0.4),
    anchor.x,
    Math.round(height * 0.79),
    232,
  );
  const faceLeft = Math.round(width * 0.18);
  const faceRight = Math.round(width * 0.82);
  const faceTop = Math.round(height * 0.3);
  const faceBottom = Math.round(height * 0.84);
  for (let y = faceTop; y <= faceBottom; y++) {
    for (let x = faceLeft; x <= faceRight; x++) {
      if (expressionMask[y * width + x] === 1) {
        mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}

function crc32(value: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  typeBytes.copy(output, 4);
  Buffer.from(data).copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBytes, Buffer.from(data)])), 8 + data.length);
  return output;
}

function encodeRgbPng(width: number, height: number, pixels: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  const scanlines = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 3);
    scanlines[row] = 0;
    Buffer.from(pixels.subarray(y * width * 3, (y + 1) * width * 3)).copy(scanlines, row + 1);
  }
  return Buffer.concat([
    pngSignature,
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

function maskPng(mask: Uint8Array, width: number, height: number): Buffer {
  const rgb = new Uint8Array(width * height * 3);
  for (let index = 0; index < mask.length; index++) {
    const value = mask[index] === 1 ? 0 : 255;
    rgb[index * 3] = value;
    rgb[index * 3 + 1] = value;
    rgb[index * 3 + 2] = value;
  }
  return encodeRgbPng(width, height, rgb);
}

const digitFont: Record<string, string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
};

function setRgb(rgb: Uint8Array, width: number, x: number, y: number, value: number): void {
  if (x < 0 || y < 0 || x >= width || y >= rgb.length / width / 3) return;
  const offset = (y * width + x) * 3;
  rgb[offset] = value;
  rgb[offset + 1] = value;
  rgb[offset + 2] = value;
}

function drawNumber(rgb: Uint8Array, width: number, x: number, y: number, text: string): void {
  let cursor = x;
  for (const character of text) {
    const glyph = digitFont[character];
    if (glyph === undefined) continue;
    for (let row = 0; row < glyph.length; row++) {
      for (let column = 0; column < glyph[row]!.length; column++) {
        if (glyph[row]![column] === "1") setRgb(rgb, width, cursor + column, y + row, 0);
      }
    }
    cursor += 5;
  }
}

function contactSheet(masks: Uint8Array[], spriteWidth: number, spriteHeight: number): Buffer {
  const width = 400;
  const height = 300;
  const rgb = new Uint8Array(width * height * 3).fill(255);
  for (let index = 0; index < masks.length; index++) {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const cellX = column * 200;
    const cellY = row * 60;
    for (let x = 0; x < 200; x++) setRgb(rgb, width, cellX + x, cellY + 59, 0);
    setRgb(rgb, width, cellX + 199, cellY, 0);
    for (let y = 0; y < 60; y++) setRgb(rgb, width, cellX + 199, cellY + y, 0);
    const mask = masks[index]!;
    for (let y = 0; y < 52; y++) {
      for (let x = 0; x < 52; x++) {
        const sourceX = Math.min(spriteWidth - 1, Math.floor(x * spriteWidth / 52));
        const sourceY = Math.min(spriteHeight - 1, Math.floor(y * spriteHeight / 52));
        if (mask[sourceY * spriteWidth + sourceX] === 1) {
          setRgb(rgb, width, cellX + 4 + x, cellY + 4 + y, 0);
        }
      }
    }
    drawNumber(rgb, width, cellX + 72, cellY + 27, String(index + 1));
  }
  return encodeRgbPng(width, height, rgb);
}

function packA1(mask: Uint8Array, width: number, height: number): Uint8Array {
  const packedWidth = Math.ceil(width / 8);
  const stride = Math.ceil(packedWidth / 8) * 8;
  const output = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 1) {
        output[y * stride + Math.floor(x / 8)]! |= 1 << (7 - (x % 8));
      }
    }
  }
  return output;
}

function identifier(state: string): string {
  return state.replaceAll("-", "_");
}

function runtimeInclude(
  states: Array<{ name: string; packed: Uint8Array }>,
  width: number,
  height: number,
): string {
  const stride = Math.ceil(Math.ceil(width / 8) / 8) * 8;
  const sections = [
    "// Generated by prepare-character-assets.ts. Do not edit by hand.",
    "#ifndef LV_ATTRIBUTE_MEM_ALIGN",
    "#define LV_ATTRIBUTE_MEM_ALIGN",
    "#endif",
    "",
  ];
  for (const state of states) {
    const name = identifier(state.name);
    const lines: string[] = [];
    for (let offset = 0; offset < state.packed.length; offset += 16) {
      const bytes = Array.from(state.packed.subarray(offset, offset + 16))
        .map((value) => `0x${value.toString(16).padStart(2, "0")}`)
        .join(", ");
      lines.push(`    ${bytes},`);
    }
    sections.push(
      `static const LV_ATTRIBUTE_MEM_ALIGN LV_ATTRIBUTE_LARGE_CONST uint8_t seeway_xiaozhi_${name}_map[] = {`,
      ...lines,
      "};",
      `static const lv_image_dsc_t seeway_xiaozhi_${name} = {`,
      "    .header = {",
      "        .magic = LV_IMAGE_HEADER_MAGIC,",
      "        .cf = LV_COLOR_FORMAT_A1,",
      "        .flags = 0,",
      `        .w = ${width},`,
      `        .h = ${height},`,
      `        .stride = ${stride},`,
      "        .reserved_2 = 0,",
      "    },",
      `    .data_size = sizeof(seeway_xiaozhi_${name}_map),`,
      `    .data = seeway_xiaozhi_${name}_map,`,
      "    .reserved = nullptr,",
      "};",
      "",
    );
  }
  return `${sections.join("\n").trimEnd()}\n`;
}

function assertEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} is stale; run prepare-character-assets.ts`);
  }
}

function main(): void {
  const checkOnly = process.argv.includes("--check");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as CharacterManifest;
  const master = readPng(join(assetRoot, manifest.master.path));
  if (
    master.width !== manifest.master.width ||
    master.height !== manifest.master.height ||
    !manifest.master.hasAlpha
  ) {
    throw new Error("Master character metadata does not match manifest.json");
  }

  const { width, height } = manifest.production.canvas;
  const masks: Uint8Array[] = [];
  const packedStates: Array<{ name: string; packed: Uint8Array }> = [];
  const spriteSha256: Record<string, string> = {};
  const spriteBounds: Record<string, PixelBounds> = {};
  const statePngSha256: Record<string, string> = {};
  const statePngs = new Map<string, Buffer>();

  for (const state of manifest.production.states) {
    const expression = readPng(join(assetRoot, state.source));
    const mask = createStateMask(
      master,
      expression,
      width,
      height,
      manifest.production.anchor,
    );
    const packed = packA1(mask, width, height);
    const png = maskPng(mask, width, height);
    masks.push(mask);
    packedStates.push({ name: state.name, packed });
    spriteSha256[state.name] = sha256(packed);
    spriteBounds[state.name] = maskBounds(mask, width, height);
    statePngSha256[state.name] = sha256(png);
    statePngs.set(state.name, png);
  }

  const preview = contactSheet(masks, width, height);
  const include = runtimeInclude(packedStates, width, height);
  const previewHash = sha256(preview);
  const includeHash = sha256(include);

  if (checkOnly) {
    assertEqual(manifest.generated.previewSha256, previewHash, "Contact sheet hash");
    assertEqual(manifest.generated.runtimeIncludeSha256 ?? "", includeHash, "Runtime include hash");
    for (const state of manifest.production.states) {
      assertEqual(manifest.generated.spriteSha256[state.name] ?? "", spriteSha256[state.name]!, `${state.name} sprite hash`);
      assertEqual(
        JSON.stringify(manifest.generated.spriteBounds?.[state.name] ?? null),
        JSON.stringify(spriteBounds[state.name]),
        `${state.name} sprite bounds`,
      );
      assertEqual(manifest.generated.statePngSha256?.[state.name] ?? "", statePngSha256[state.name]!, `${state.name} PNG hash`);
      const generatedPath = join(assetRoot, `generated/states/${state.name}.png`);
      if (!existsSync(generatedPath)) throw new Error(`Missing generated state: ${state.name}`);
      assertEqual(sha256(readFileSync(generatedPath)), statePngSha256[state.name]!, `${state.name} generated file`);
    }
    assertEqual(sha256(readFileSync(join(assetRoot, manifest.generated.preview))), previewHash, "Generated contact sheet");
    assertEqual(sha256(readFileSync(runtimeIncludePath)), includeHash, "Generated runtime include");
    return;
  }

  mkdirSync(join(assetRoot, "generated/states"), { recursive: true });
  mkdirSync(dirname(runtimeIncludePath), { recursive: true });
  for (const [state, png] of statePngs) {
    writeFileSync(join(assetRoot, `generated/states/${state}.png`), png);
  }
  writeFileSync(join(assetRoot, manifest.generated.preview), preview);
  writeFileSync(runtimeIncludePath, include, "utf8");
  manifest.generated.previewSha256 = previewHash;
  manifest.generated.spriteSha256 = spriteSha256;
  manifest.generated.spriteBounds = spriteBounds;
  manifest.generated.statePngSha256 = statePngSha256;
  manifest.generated.runtimeIncludeSha256 = includeHash;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

main();
