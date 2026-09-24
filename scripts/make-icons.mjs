#!/usr/bin/env node
/**
 * Generate the PWA / app icons.
 *
 * Drawn procedurally rather than sourced from an image generator: the mark is
 * geometric, so a script gives exact control over the colours (they must match
 * the app's CSS custom properties) and produces a reproducible file rather than
 * an opaque binary.
 *
 * Writes raw PNGs with no dependencies — a minimal encoder is less machinery
 * than pulling in a canvas library for a few small squares.
 *
 * Two variants are produced for each size:
 *   icon-N.png          the full mark, on the app's dark background
 *   icon-N-maskable.png the same mark inside the safe zone, on a full-bleed
 *                       background — Android crops maskable icons to whatever
 *                       shape the launcher uses (circle, squircle, teardrop)
 *                       and anything outside the middle 80% gets cut off
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Matches --bg / --accent in src/ui/styles.css.
const BG = [0x0f, 0x11, 0x15];
const ACCENT = [0x4e, 0xa1, 0xff];
// The glass walls sit *behind* the liquid visually, so they are the dimmer of
// the two. An earlier version had this the other way round and the filled
// flask read as a dark triangle with a bright outline.
const GLASS_DIM = [0x2b, 0x5c, 0x94];
const LIQUID = [0x4e, 0xa1, 0xff];

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

/** Linear blend of two RGB triples. */
const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/** Rounded-rectangle test, used for the icon's plate. */
function inRoundRect(x, y, cx, cy, halfW, halfH, r) {
  const dx = Math.abs(x - cx) - (halfW - r);
  const dy = Math.abs(y - cy) - (halfH - r);
  if (dx <= 0 && dy <= 0) return true;
  const qx = Math.max(dx, 0);
  const qy = Math.max(dy, 0);
  return qx * qx + qy * qy <= r * r;
}

/**
 * The mark: a flask, filled with liquid, inside a rounded plate.
 *
 * The fill is what makes it read at 16px. An outline-only flask turns into a
 * grey smudge at favicon size, which is the size most people actually see.
 */
function drawIcon(size, { maskable = false } = {}) {
  const SS = 4;                 // supersampling factor
  const S = size * SS;
  const px = Buffer.alloc(size * size * 4);

  // Maskable icons must keep their content inside the middle 80%, so the mark
  // is drawn smaller and the background bleeds to the edges.
  const scale = maskable ? 0.66 : 0.82;

  // Flask geometry in unit space, then scaled about the centre.
  const geo = {
    neckW: 0.16,
    neckTop: 0.20,
    neckBottom: 0.40,
    bodyBottom: 0.82,
    bodyHalf: 0.30,
  };

  const unit = (fx, fy) => {
    // Map the unit square to the scaled mark.
    const ux = 0.5 + (fx - 0.5) / scale;
    const uy = 0.5 + (fy - 0.5) / scale;
    return [ux, uy];
  };

  const inFlask = (ux, uy) => {
    if (uy >= geo.neckTop && uy <= geo.neckBottom) return Math.abs(ux - 0.5) <= geo.neckW / 2;
    if (uy > geo.neckBottom && uy <= geo.bodyBottom) {
      const t = (uy - geo.neckBottom) / (geo.bodyBottom - geo.neckBottom);
      const half = geo.neckW / 2 + t * (geo.bodyHalf - geo.neckW / 2);
      return Math.abs(ux - 0.5) <= half;
    }
    return false;
  };

  // Liquid fills the body from a fixed level down. Drawn slightly inside the
  // glass so the wall stays visible against it.
  const liquidTop = 0.60;
  const inLiquid = (ux, uy) => {
    if (uy < liquidTop || uy > geo.bodyBottom) return false;
    const t = (uy - geo.neckBottom) / (geo.bodyBottom - geo.neckBottom);
    const half = geo.neckW / 2 + t * (geo.bodyHalf - geo.neckW / 2) - 0.035;
    return Math.abs(ux - 0.5) <= half;
  };

  const inGlass = (ux, uy) => inFlask(ux, uy) && !inLiquid(ux, uy);

  // A small bubble rising through the liquid — the one detail that says
  // "chemistry" rather than "triangle".
  const inBubble = (ux, uy) => {
    const dx = ux - 0.44;
    const dy = uy - 0.70;
    return dx * dx + dy * dy <= 0.022 * 0.022;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let glass = 0;
      let liquid = 0;
      let bubble = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = (x + (sx + 0.5) / SS) / size;
          const fy = (y + (sy + 0.5) / SS) / size;
          const [ux, uy] = unit(fx, fy);
          if (inGlass(ux, uy)) glass++;
          if (inLiquid(ux, uy)) liquid++;
          if (inBubble(ux, uy) && inLiquid(ux, uy)) bubble++;
        }
      }

      const n = SS * SS;
      const aGlass = glass / n;
      const aLiquid = liquid / n;
      const aBubble = bubble / n;

      // Background: a rounded plate, or full bleed when maskable.
      const plate = maskable
        ? 1
        : (inRoundRect(x / size, y / size, 0.5, 0.5, 0.5, 0.5, 0.22) ? 1 : 0);

      // A subtle vertical gradient on the plate so it does not read as flat.
      const bg = mix(BG, [0x16, 0x1b, 0x26], y / size);

      // Layer: plate → liquid → glass → bubble.
      let col = bg;
      let alpha = plate;

      if (plate > 0) {
        if (aGlass > 0) col = mix(col, GLASS_DIM, aGlass);
        if (aLiquid > 0) col = mix(col, LIQUID, aLiquid);
        if (aBubble > 0) col = mix(col, [0x9c, 0xcd, 0xff], aBubble);
      }

      const i = (y * size + x) * 4;
      px[i] = Math.round(Math.min(255, Math.max(0, col[0])));
      px[i + 1] = Math.round(Math.min(255, Math.max(0, col[1])));
      px[i + 2] = Math.round(Math.min(255, Math.max(0, col[2])));
      px[i + 3] = Math.round(alpha * 255);
    }
  }
  return px;
}

const outDir = path.join(process.cwd(), 'public');
fs.mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  for (const maskable of [false, true]) {
    const png = encodePng(size, size, drawIcon(size, { maskable }));
    const name = maskable ? `icon-${size}-maskable.png` : `icon-${size}.png`;
    const file = path.join(outDir, name);
    fs.writeFileSync(file, png);
    console.log(`  ${name}  ${size}×${size}  ${png.length} bytes`);
  }
}

// The browser tab icon. A 32px PNG keeps the mark crisp where an SVG would
// need the font and shapes inlined; it is small enough to be free.
{
  const png = encodePng(32, 32, drawIcon(32));
  const file = path.join(outDir, 'favicon-32.png');
  fs.writeFileSync(file, png);
  console.log(`  favicon-32.png  32×32  ${png.length} bytes`);
}
