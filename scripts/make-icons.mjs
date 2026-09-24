#!/usr/bin/env node
/**
 * Generate the PWA icons.
 *
 * Drawn procedurally rather than sourced from an image generator: the mark is
 * a few geometric strokes, so a script gives exact control over the colours
 * (they must match the app's CSS custom properties) and produces a
 * reproducible file rather than an opaque binary.
 *
 * Writes raw PNGs with no dependencies — a minimal encoder is less machinery
 * than pulling in a canvas library for two small squares.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const BG = [0x0f, 0x11, 0x15];
const FG = [0x4e, 0xa1, 0xff];

/** CRC-32, required by the PNG chunk format. */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type: RGBA
  // 10,11,12 = compression, filter, interlace — all zero

  // One filter byte (0 = none) per scanline.
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * An Erlenmeyer flask, drawn as filled geometry.
 *
 * Built from signed-distance-ish tests rather than rasterised paths: for a
 * shape this simple it is less code and has no anti-aliasing surprises.
 * Supersampling 3× handles the edges.
 */
function drawIcon(size) {
  const SS = 3;
  const S = size * SS;
  const px = Buffer.alloc(size * size * 4);

  // Geometry as fractions of the canvas.
  const neckW = 0.13;
  const neckTop = 0.20;
  const neckBottom = 0.36;
  const bodyTop = 0.36;
  const bodyBottom = 0.78;
  const bodyHalf = 0.26;
  const stroke = 0.055;

  const inFlask = (x, y) => {
    // Neck: a vertical bar.
    if (y >= neckTop && y <= neckBottom) {
      return Math.abs(x - 0.5) <= neckW / 2;
    }
    // Body: a trapezoid widening from neckBottom to bodyBottom.
    if (y > neckBottom && y <= bodyBottom) {
      const t = (y - neckBottom) / (bodyBottom - neckBottom);
      const half = (neckW / 2) + t * (bodyHalf - neckW / 2);
      return Math.abs(x - 0.5) <= half;
    }
    return false;
  };

  // Outline = inside the flask, but not inside a flask shrunk by `stroke`.
  // The shrink applies on every side INCLUDING the top, which closes the neck
  // rim — an earlier version only inset left/right and the mouth read as a
  // broken-off stub.
  const insideShrunk = (x, y) => {
    const inset = stroke;
    if (y >= neckTop + inset && y <= neckBottom) {
      return Math.abs(x - 0.5) <= neckW / 2 - inset;
    }
    if (y > neckBottom && y <= bodyBottom - inset) {
      const t = (y - neckBottom) / (bodyBottom - neckBottom);
      const half = (neckW / 2) + t * (bodyHalf - neckW / 2) - inset;
      return half > 0 && Math.abs(x - 0.5) <= half;
    }
    return false;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = (x + (sx + 0.5) / SS) / size;
          const fy = (y + (sy + 0.5) / SS) / size;
          if (inFlask(fx, fy) && !insideShrunk(fx, fy)) hits++;
        }
      }
      const a = hits / (SS * SS);
      const i = (y * size + x) * 4;
      px[i] = Math.round(BG[0] * (1 - a) + FG[0] * a);
      px[i + 1] = Math.round(BG[1] * (1 - a) + FG[1] * a);
      px[i + 2] = Math.round(BG[2] * (1 - a) + FG[2] * a);
      px[i + 3] = 255;
    }
  }
  return px;
}

const outDir = path.join(process.cwd(), 'public');
fs.mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  const png = encodePng(size, size, drawIcon(size));
  const file = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`  ${file}  ${size}×${size}  ${png.length} bytes`);
}
