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

/*
 * Colours, matched to the dark palette in src/ui/palettes.mjs.
 *
 * BG was #0f1115 while the app's own background is #0b0d12, so the icon sat on
 * a plate one shade off from the app it opens — visible side by side on a
 * launcher and wrong in a way nobody would think to check.
 */
const BG = [0x0b, 0x0d, 0x12];
const BG_TOP = [0x16, 0x20, 0x3a];
const ACCENT = [0x5a, 0xa9, 0xff];
// The glass walls sit *behind* the liquid visually, so they are the dimmer of
// the two. An earlier version had this the other way round and the filled
// flask read as a dark triangle with a bright outline.
const GLASS_DIM = [0x2b, 0x5c, 0x94];
const GLASS_LIT = [0x5a, 0x8f, 0xc8];
const LIQUID = [0x4e, 0xa1, 0xff];
const LIQUID_DEEP = [0x1f, 0x5c, 0xa8];
const LIQUID_LIT = [0x9c, 0xcd, 0xff];
const HILIGHT = [0xea, 0xf3, 0xff];

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

      /*
       * The plate is lit from the upper left, the same direction as the glass
       * highlight. A flat fill reads as a sticker; two stops along the
       * diagonal are enough to read as a surface without looking like a
       * gradient swatch.
       */
      const diag = (x / size + y / size) / 2;
      const bg = mix(BG_TOP, BG, Math.min(1, diag * 1.35));

      // Layer: plate → liquid → glass → bubble → highlight.
      let col = bg;
      let alpha = plate;

      if (plate > 0) {
        /*
         * Liquid, shaded by depth.
         *
         * The surface catches light and the bottom goes dark, which is what
         * makes it read as a volume rather than a blue shape. `liquidT` is 0 at
         * the meniscus and 1 at the base.
         */
        if (aLiquid > 0) {
          const [ux, uy] = unit((x + 0.5) / size, (y + 0.5) / size);
          const liquidT = Math.min(1, Math.max(0,
            (uy - liquidTop) / (geo.bodyBottom - liquidTop)));
          // A band just under the surface is brightest, then it falls off.
          const surfaceGlow = Math.exp(-liquidT * 7) * 0.75;
          const body = mix(LIQUID, LIQUID_DEEP, liquidT * 0.85);
          const lit = mix(body, LIQUID_LIT, surfaceGlow);
          col = mix(col, lit, aLiquid);
        }

        /*
         * Glass, shaded across its width.
         *
         * A vertical gradient alone left the walls flat. Shading on x instead
         * makes the left wall catch light and the right wall fall away, which
         * is how a cylinder actually reads.
         */
        if (aGlass > 0) {
          const [ux] = unit((x + 0.5) / size, (y + 0.5) / size);
          const across = Math.min(1, Math.max(0, (ux - 0.28) / 0.44));
          const wall = mix(GLASS_LIT, GLASS_DIM, across);
          col = mix(col, wall, aGlass);
        }

        if (aBubble > 0) col = mix(col, LIQUID_LIT, aBubble);

        /*
         * Two specular highlights: a long one down the neck's left edge and a
         * short one on the shoulder. This is the detail that separates a
         * rendered object from a filled shape, and it is the whole reason the
         * mark reads as glass at 192px.
         */
        const [hx, hy] = unit((x + 0.5) / size, (y + 0.5) / size);
        const neckGlint = (hx > 0.432 && hx < 0.456 && hy > 0.235 && hy < 0.395)
          ? (1 - Math.abs(hx - 0.444) / 0.012) * 0.85 : 0;
        const shoulderGlint = (hx > 0.30 && hx < 0.335 && hy > 0.52 && hy < 0.74)
          ? (1 - Math.abs(hx - 0.3175) / 0.0175) * 0.5 : 0;
        /*
         * Clipped to the flask. Without this the shoulder highlight drew a
         * grey bar floating outside the left wall — the coordinates put it on
         * the wall's outer edge, and nothing stopped it painting over the
         * background. A highlight on a transparent surface is only meaningful
         * where there is a surface.
         */
        const glint = inFlask(hx, hy) ? Math.max(neckGlint, shoulderGlint) : 0;
        if (glint > 0) col = mix(col, HILIGHT, Math.min(1, glint));
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

/**
 * The Windows executable icon.
 *
 * ICO is a container, not an image format: a six-byte header, then one 16-byte
 * directory entry per image, then the images themselves. Since Vista the
 * entries may hold a PNG verbatim, so this needs no second encoder — the same
 * `encodePng` output goes straight in.
 *
 * Several sizes are embedded because Windows picks per context: 16px for the
 * title bar and task list, 32px for the desktop, 48px and 256px for Explorer's
 * larger views. Shipping only 256 would have Windows downscale a detailed mark
 * to 16px, which is where the flask turns to mush.
 */
{
  const sizes = [16, 32, 48, 64, 128, 256];
  const images = sizes.map((s) => ({ size: s, png: encodePng(s, s, drawIcon(s)) }));

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);              // reserved
  header.writeUInt16LE(1, 2);              // type: 1 = icon
  header.writeUInt16LE(images.length, 4);

  const dirSize = 16 * images.length;
  let offset = 6 + dirSize;
  const entries = [];
  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    // 256 is stored as 0 — the field is one byte and 256 does not fit.
    e[0] = size === 256 ? 0 : size;
    e[1] = size === 256 ? 0 : size;
    e[2] = 0;                              // palette colours
    e[3] = 0;                              // reserved
    e.writeUInt16LE(1, 4);                 // colour planes
    e.writeUInt16LE(32, 6);                // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += png.length;
  }

  const ico = Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
  const dir = path.join(process.cwd(), 'desktop');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'icon.ico');
  fs.writeFileSync(file, ico);
  console.log(`  icon.ico  ${sizes.join('/')}  ${ico.length} bytes`);
}
