#!/usr/bin/env node
/*
 * Generate the PWA icons.
 *
 * Written against zlib and a hand-rolled PNG encoder rather than pulling in an
 * image library: it is about eighty lines, it keeps the dependency tree of a
 * build step at zero, and the icons are simple enough to describe as maths.
 *
 * The generated files are committed, so a checkout works without running this.
 * Re-run with `npm run icons` after changing the design.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_DIR = join(ROOT, "apps", "web", "public", "icons");
const MOBILE_DIR = join(ROOT, "apps", "mobile", "assets");

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** Encode RGBA pixel data as a PNG. */
function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type "none"
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/** Soft edge over roughly one pixel, so the mark is not jagged at 48px. */
function coverage(distance, feather) {
  return clamp01(0.5 - distance / feather);
}

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

const BACKGROUND_INNER = [22, 35, 59];
const BACKGROUND_OUTER = [8, 14, 26];
const RING = [52, 211, 153];
const DIAMOND = [244, 197, 94];

/**
 * @param {number} size
 * @param {boolean} maskable Fill the whole square and keep the mark inside the
 *   safe zone, which is what Android's adaptive icon crop expects.
 */
function drawIcon(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4);
  const center = (size - 1) / 2;
  const feather = Math.max(1.2, size / 160);
  const scale = maskable ? 0.62 : 0.82;
  const radius = (size / 2) * scale * 0.72;
  const ringWidth = Math.max(2, size * 0.055);
  const diamondHalf = radius * 0.46;
  const corner = maskable ? 0 : size * 0.22;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      const distance = Math.hypot(dx, dy);

      // Rounded-square mask (a superellipse would be prettier; this is enough).
      let alpha = 1;
      if (corner > 0) {
        const qx = Math.abs(dx) - (size / 2 - corner);
        const qy = Math.abs(dy) - (size / 2 - corner);
        const outside =
          qx > 0 && qy > 0 ? Math.hypot(qx, qy) - corner : Math.max(qx, qy) - corner;
        alpha = clamp01(0.5 - outside / feather);
      }

      const falloff = clamp01(distance / (size * 0.62));
      let colour = mix(BACKGROUND_INNER, BACKGROUND_OUTER, falloff);

      const ringCoverage = coverage(Math.abs(distance - radius) - ringWidth / 2, feather);
      if (ringCoverage > 0) colour = mix(colour, RING, ringCoverage);

      const diamond = Math.abs(dx) + Math.abs(dy) - diamondHalf;
      const diamondCoverage = coverage(diamond, feather);
      if (diamondCoverage > 0) colour = mix(colour, DIAMOND, diamondCoverage);

      const offset = (y * size + x) * 4;
      rgba[offset] = Math.round(colour[0]);
      rgba[offset + 1] = Math.round(colour[1]);
      rgba[offset + 2] = Math.round(colour[2]);
      rgba[offset + 3] = Math.round(alpha * 255);
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync(WEB_DIR, { recursive: true });
mkdirSync(MOBILE_DIR, { recursive: true });

const targets = [
  [WEB_DIR, "icon-192.png", 192, false],
  [WEB_DIR, "icon-512.png", 512, false],
  [WEB_DIR, "icon-maskable-512.png", 512, true],
  // Expo: a square app icon, an Android adaptive foreground (which is
  // cropped, so it uses the maskable safe zone), and a web favicon.
  [MOBILE_DIR, "icon.png", 1024, false],
  [MOBILE_DIR, "adaptive-icon.png", 1024, true],
  [MOBILE_DIR, "splash.png", 1024, true],
  [MOBILE_DIR, "favicon.png", 48, false],
];

for (const [dir, name, size, maskable] of targets) {
  writeFileSync(join(dir, name), drawIcon(size, maskable));
  console.log(`wrote ${name} (${size}x${size}${maskable ? ", maskable" : ""})`);
}
