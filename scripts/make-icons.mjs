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

export function encodePng(width, height, rgba) {
  /*
   * Callers hand in either a Buffer (what `drawIcon` builds) or a plain
   * Uint8Array (what a composing script naturally produces). `Buffer.copy` is
   * the only method used below that a Uint8Array lacks, so normalising here is
   * cheaper than making every caller remember which one is required.
   */
  if (!Buffer.isBuffer(rgba)) rgba = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);

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
export function drawIcon(size, { maskable = false } = {}) {
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

  /*
   * The strata: each band is one calculation, the newest on top.
   *
   * This replaced a rising bubble, and the swap is the whole point of the mark.
   * A bubble is the *topic* — every chemistry app could ship it, because every
   * chemistry app has the same topic. What this app does that the others do not
   * is keep every calculation ("算完就忘" is the README's line about them), and
   * a record looks like strata: one layer laid on the one before it.
   *
   * The bands follow the flask's taper, so a band's edges are cut by the wall
   * the same way a layer of liquid in a conical vessel is. The inline
   * `BrandMark` gets that from an SVG clip; here the geometry is already
   * per-pixel, so it falls out of `inLiquid` being evaluated at each sample.
   *
   * The boundaries are in the same unit space as the flask, spanning the liquid
   * body. Four bands over 0.60→0.82, which is what survives at 16px — five
   * would collapse into a single tone.
   */
  const BAND_EDGES = [0.60, 0.655, 0.71, 0.765, 0.82];

  /** Which band a point is in, 0 (newest, top) to 3 (oldest), or -1. */
  const bandOf = (uy) => {
    for (let i = 0; i < BAND_EDGES.length - 1; i++) {
      if (uy >= BAND_EDGES[i] && uy < BAND_EDGES[i + 1]) return i;
    }
    return -1;
  };

  /*
   * Each band is dimmer than the one above it.
   *
   * The ramp is what makes the bands read as *time* rather than as a striped
   * pattern — a direction, not a texture. Spaced widely enough to survive at
   * 16px, where a 0.1 step would collapse into one tone. These are the same
   * four values the inline mark uses, so the two cannot drift apart.
   */
  const BAND_OPACITY = [0.95, 0.72, 0.5, 0.3];

  /*
   * How far each band is pushed toward the light, and toward the dark.
   *
   * The first attempt mixed every band toward `LIQUID_LIT` by its ramp value,
   * which made the four bands differ from each other by about 4% of luminance —
   * measured, not guessed, and invisible. The ramp only reads if the bands move
   * in *both* directions from the liquid's own tone: the newest layer catches
   * the light, the oldest has settled into the dark.
   *
   * `SETTLE` is that darkening, and it is what makes the stack read as depth.
   * Without it the mark is a flask with a highlight; with it, it is a flask
   * with a history.
   */
  const SETTLE = [0.0, 0.18, 0.34, 0.5];

  /*
   * A hairline at each boundary, in the lit colour.
   *
   * The measured ramp between adjacent bands is about 10-30 units of luminance,
   * which the eye reads as one smooth gradient rather than as four layers —
   * verified by sampling the rendered raster, not by looking at it. The mark is
   * *about* the layers, so the boundary has to be visible.
   *
   * A bright line at each interface is also what a stratified liquid actually
   * looks like: the refractive index step between two layers catches light.
   * It is the same device the inline SVG gets for free from its sharp band
   * edges, which the supersampled raster otherwise smooths away.
   */
  const EDGE_HALF_WIDTH = 0.0035;
  const nearEdge = (uy) => BAND_EDGES.some(
    (e, i) => i > 0 && i < BAND_EDGES.length - 1 && Math.abs(uy - e) <= EDGE_HALF_WIDTH,
  );

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let glass = 0;
      let liquid = 0;
      // Per-band coverage, so the opacity ramp can be applied after averaging
      // rather than inside the supersampling loop.
      const bandHits = [0, 0, 0, 0];
      // Interface-line coverage, averaged like everything else. Sampling it
      // per pixel rather than per sample would give a line whose thickness
      // depends on the supersampling factor.
      let edgeHits = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = (x + (sx + 0.5) / SS) / size;
          const fy = (y + (sy + 0.5) / SS) / size;
          const [ux, uy] = unit(fx, fy);
          if (inGlass(ux, uy)) glass++;
          if (inLiquid(ux, uy)) {
            liquid++;
            const b = bandOf(uy);
            if (b >= 0) bandHits[b]++;
            if (nearEdge(uy)) edgeHits++;
          }
        }
      }

      const n = SS * SS;
      const aGlass = glass / n;
      const aLiquid = liquid / n;
      const aBand = bandHits.map((c) => c / n);
      const aEdge = edgeHits / n;

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

        /*
         * The bands, drawn over the shaded liquid.
         *
         * Each is mixed in at its own ramp opacity, so a band's contribution is
         * a *fraction of the difference* between the liquid colour and the lit
         * colour — which is what makes the ramp read as depth of time rather
         * than as four flat rectangles of paint.
         *
         * Applied per band in order, newest first, so a boundary pixel that
         * both bands cover takes the newer one's value last. At 16px that
         * ordering is invisible; at 512px it keeps the top edge crisp.
         */
        for (let b = BAND_OPACITY.length - 1; b >= 0; b--) {
          if (aBand[b] <= 0) continue;
          const t = aBand[b];
          const lit = mix(col, LIQUID_LIT, BAND_OPACITY[b] * 0.7);
          const settled = mix(lit, LIQUID_DEEP, SETTLE[b]);
          col = mix(col, settled, t);
        }

        /*
         * The interface line, drawn after the bands so it sits on top of both.
         *
         * Only where there is liquid: the boundary at the meniscus is the
         * liquid's own surface and already has the surface glow, and drawing a
         * second line there would make it read as one layer too many.
         */
        if (aEdge > 0) {
          col = mix(col, LIQUID_LIT, aEdge * 0.85);
        }

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

/**
 * The file-writing half, behind a guard.
 *
 * `make-screenshots.mjs` imports `drawIcon` and `encodePng` from this module to
 * compose store screenshots. Without the guard, importing it would rewrite
 * every icon as a side effect of the import, which is surprising and makes the
 * two scripts impossible to run independently.
 */
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
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
   * The Android launcher icons.
   *
   * Written into the Capacitor project's resource tree rather than into
   * `public/`, because that is where the Android build reads them from — the
   * web manifest's icons are for the PWA and are not what a launcher shows.
   * Without this the APK ships Capacitor's default icon: a generic Android
   * placeholder, dated before this project existed.
   *
   * Five densities, because Android picks by screen density and scales nothing:
   * a launcher asks for the bucket matching the device, and a missing one is a
   * blank square rather than a fallback. 48/72/96/144/192 dp is the standard
   * ladder for a legacy square icon.
   *
   * The adaptive variants (`anydpi-v26`) are what modern launchers actually
   * use: a foreground layer and a background layer the launcher masks to
   * whatever shape it likes — circle, squircle, teardrop. The foreground is
   * drawn with `maskable` so the mark sits inside the 66% safe zone; anything
   * outside it is cropped, and the flask's spout was the part that got cut.
   */
  {
    const androidRes = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'res');
    if (fs.existsSync(path.join(process.cwd(), 'android'))) {
      const buckets = [
        ['mdpi', 48], ['hdpi', 72], ['xhdpi', 96],
        ['xxhdpi', 144], ['xxxhdpi', 192],
      ];
      let written = 0;
      for (const [bucket, size] of buckets) {
        const dir = path.join(androidRes, `mipmap-${bucket}`);
        fs.mkdirSync(dir, { recursive: true });
        const square = encodePng(size, size, drawIcon(size));
        fs.writeFileSync(path.join(dir, 'ic_launcher.png'), square);
        fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), square);
        // The adaptive foreground is drawn at the full icon size but with the
        // mark inside the safe zone, so the launcher's mask has room to crop.
        fs.writeFileSync(
          path.join(dir, 'ic_launcher_foreground.png'),
          encodePng(size, size, drawIcon(size, { maskable: true })),
        );
        written += 3;
      }
      console.log(`  android mipmap-*  5 密度 × 3 个  ${written} 个文件`);
    } else {
      console.log('  （跳过 Android 图标：没有 android/ 目录）');
    }
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
}
