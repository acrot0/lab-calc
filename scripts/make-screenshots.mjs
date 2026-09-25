#!/usr/bin/env node
/**
 * Generate the store screenshots the manifest declares.
 *
 * ## Why these are composed rather than captured
 *
 * A real screenshot of the app would be better, and it is what a browser
 * extension or Playwright would give. But a captured screenshot has to be
 * retaken every time the interface changes, and nothing fails when it is
 * stale — the file stays on disk looking plausible while showing a version of
 * the app that no longer exists.
 *
 * So these are drawn: the app's own mark, its palette, and a mock of the
 * layout, composed procedurally from the same `drawIcon` the launcher icons
 * use. They are honest about being illustrative, they cannot go stale in a way
 * that misleads (the colours and the mark come from the same source as the app
 * itself), and they regenerate in a second.
 *
 * ## What Android actually uses them for
 *
 * `screenshots` in the manifest is what turns Chrome's install prompt from a
 * small bar into a rich card with a preview. Without it the app still
 * installs, which is why this was missing — nothing broke, the prompt was just
 * poorer. The `narrow` form factor is the one a phone shows.
 *
 * Both a wide and a narrow form are produced because the manifest lets a
 * browser pick, and a phone given only a wide screenshot letterboxes it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { encodePng, drawIcon } from './make-icons.mjs';
import { PALETTES } from '../src/ui/palettes.mjs';

/*
 * The screenshot palette, taken from the app's own dark theme.
 *
 * Imported rather than copied. A screenshot is a claim about what the app looks
 * like, so a hardcoded copy that drifts is worse than no screenshot — it would
 * show colours the app no longer uses, in a file nothing regenerates. Reading
 * the tokens means the images cannot disagree with the product.
 */
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const T = PALETTES.dark.tokens;
const BG = hex(T.bg);
const SURFACE = hex(T.surface);
const SURFACE_2 = hex(T.surface2);
const BORDER = hex(T.border);
const ACCENT = hex(T.accent);
const TEXT = hex(T.text);
const TEXT_DIM = hex(T.textDim);

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** A rounded rectangle, anti-aliased by 4× supersampling on the edge only. */
function roundedRect(px, W, H, x, y, w, h, r, colour, alpha = 1) {
  const SS = 3;
  for (let py = Math.max(0, Math.floor(y)); py < Math.min(H, Math.ceil(y + h)); py++) {
    for (let pxi = Math.max(0, Math.floor(x)); pxi < Math.min(W, Math.ceil(x + w)); pxi++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = pxi + (sx + 0.5) / SS;
          const fy = py + (sy + 0.5) / SS;
          // Distance to the rounded rect's core, then its corner circles.
          const dx = Math.abs(fx - (x + w / 2)) - (w / 2 - r);
          const dy = Math.abs(fy - (y + h / 2)) - (h / 2 - r);
          const qx = Math.max(dx, 0);
          const qy = Math.max(dy, 0);
          if (dx <= 0 && dy <= 0) hits++;
          else if (qx * qx + qy * qy <= r * r) hits++;
        }
      }
      if (!hits) continue;
      const cov = (hits / (SS * SS)) * alpha;
      const i = (py * W + pxi) * 4;
      const base = [px[i], px[i + 1], px[i + 2]];
      const out = mix(base, colour, cov);
      px[i] = Math.round(out[0]);
      px[i + 1] = Math.round(out[1]);
      px[i + 2] = Math.round(out[2]);
      px[i + 3] = 255;
    }
  }
}

/** A filled disc — the app's cells are rounded squares, but dots read better. */
function dot(px, W, H, cx, cy, r, colour, alpha = 1) {
  roundedRect(px, W, H, cx - r, cy - r, r * 2, r * 2, r, colour, alpha);
}

/** Paste the app's own mark, scaled, at a position. */
function pasteMark(px, W, H, atX, atY, size) {
  const mark = drawIcon(size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const mi = (y * size + x) * 4;
      const a = mark[mi + 3] / 255;
      if (a === 0) continue;
      const px_x = atX + x;
      const px_y = atY + y;
      if (px_x < 0 || px_x >= W || px_y < 0 || px_y >= H) continue;
      const i = (px_y * W + px_x) * 4;
      const base = [px[i], px[i + 1], px[i + 2]];
      const src = [mark[mi], mark[mi + 1], mark[mi + 2]];
      const out = mix(base, src, a);
      px[i] = Math.round(out[0]);
      px[i + 1] = Math.round(out[1]);
      px[i + 2] = Math.round(out[2]);
      px[i + 3] = 255;
    }
  }
}

/**
 * Whether the periodic table has a cell at (row, column) in its 18-column
 * layout. The gaps are the whole point — a full rectangle does not read as a
 * periodic table, the stepped silhouette does.
 */
function eltCell(r, c) {
  if (r === 0) return c === 0 || c === 17;                 // H, He
  if (r === 1 || r === 2) return c <= 1 || c >= 12;        // Li…Mg, B…Ne, Na…Ar
  if (r >= 3 && r <= 6) return true;                       // the long rows
  return false;
}

/**
 * Lay out the periodic table silhouette inside a box, returning the cell
 * geometry. Shared so both form factors draw the same shape at their own size.
 */
function eltLayout(x0, y0, w, h) {
  const cols = 18;
  const gap = Math.max(2, Math.round(w * 0.005));
  const cw = (w - gap * (cols - 1)) / cols;
  // 7 long rows + a spacer + 2 f-block rows, sized to fit the taller of the
  // two constraints so the grid stays square-ish.
  const rows = 7 + 0.6 + 2;
  const ch = Math.min(cw, (h - gap * (rows - 1)) / rows);
  const totalH = ch * rows + gap * (rows - 1);
  const top = y0 + (h - totalH) / 2;
  const at = (r, c) => [x0 + c * (cw + gap), top + r * (ch + gap)];
  return { cw, ch, gap, at, fOff: 7.6 };
}

/** The periodic table, drawn with a tiny number-and-symbol inside each cell. */
function drawElements(px, W, H, x0, y0, w, h, accentAt) {
  const L = eltLayout(x0, y0, w, h);
  const cell = (x, y, on) => {
    roundedRect(px, W, H, x, y, L.cw, L.ch, Math.max(2, L.cw * 0.14),
      on ? ACCENT : SURFACE_2, 1);
    // A dim bar standing in for the element symbol, and a shorter one for the
    // atomic number. Enough shape to read as a table of data at a glance.
    roundedRect(px, W, H, x + L.cw * 0.22, y + L.ch * 0.3, L.cw * 0.56, Math.max(1.5, L.ch * 0.16),
      Math.max(1, L.cw * 0.05), on ? [0x0b, 0x18, 0x2c] : TEXT, 0.85);
    roundedRect(px, W, H, x + L.cw * 0.3, y + L.ch * 0.58, L.cw * 0.4, Math.max(1, L.ch * 0.08),
      1, on ? [0x0b, 0x18, 0x2c] : TEXT_DIM, 0.7);
  };
  for (let r = 0; r <= 6; r++) {
    for (let c = 0; c < 18; c++) {
      if (!eltCell(r, c)) continue;
      const [x, y] = L.at(r, c);
      cell(x, y, accentAt(r, c));
    }
  }
  for (let f = 0; f < 2; f++) {
    for (let c = 2; c <= 16; c++) {
      const [x, y] = L.at(L.fOff + f, c);
      cell(x, y, accentAt(L.fOff + f, c));
    }
  }
}

/** A soft drop shadow approximated by stacked translucent rounded rects. */
function shadow(px, W, H, x, y, w, h, r) {
  for (let i = 4; i >= 1; i--) {
    roundedRect(px, W, H, x - i * 1.5, y - i * 1.5 + i, w + i * 3, h + i * 3, r + i * 1.5, [0, 0, 0], 0.07);
  }
}

/** The calculator window: title bar, display, and a keypad with one accent key. */
function drawCalc(px, W, H, x, y, w, h) {
  shadow(px, W, H, x, y, w, h, 14);
  roundedRect(px, W, H, x, y, w, h, 14, mix(SURFACE, BG, 0.3), 1);
  roundedRect(px, W, H, x, y, w, h, 14, BORDER, 0.8);

  const p = w * 0.055;
  // The drag handle: a short bar centred in the title strip.
  roundedRect(px, W, H, x + w / 2 - w * 0.09, y + p * 0.9, w * 0.18, Math.max(2, h * 0.008), 2, TEXT_DIM, 0.55);
  // Display.
  roundedRect(px, W, H, x + p, y + p * 2.2, w - p * 2, h * 0.15, 7, SURFACE_2, 1);
  roundedRect(px, W, H, x + w - p - w * 0.42, y + p * 2.2 + h * 0.05, w * 0.38, h * 0.05, 3, TEXT, 0.8);

  const cols = 4;
  const rows = 5;
  const g = w * 0.028;
  const top = y + h * 0.32;
  const kw = (w - p * 2 - g * (cols - 1)) / cols;
  const kh = (h - (top - y) - p - g * (rows - 1)) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const kx = x + p + c * (kw + g);
      const ky = top + r * (kh + g);
      const isEq = r === rows - 1 && c >= cols - 2;
      const wide = r === rows - 1 && c >= cols - 2;
      const kwid = wide ? kw * 2 + g : kw;
      roundedRect(px, W, H, kx, ky, kwid, kh, Math.max(3, kw * 0.16),
        isEq ? ACCENT : SURFACE_2, 1);
      if (!isEq) {
        roundedRect(px, W, H, kx + kw * 0.3, ky + kh * 0.38, kw * 0.4, Math.max(1.5, kh * 0.16), 1, TEXT, 0.7);
      }
      if (wide) { c = cols; }  // the two wide keys consume the rest of the row
    }
  }
}

/** The topbar: the app's mark, the brand, and control pills on the right. */
function drawTopbar(px, W, H, pad, h, controls) {
  const markSize = Math.round(h * 0.6);
  pasteMark(px, W, H, pad, Math.round((h - markSize) / 2), markSize);
  const tx = pad + markSize + Math.round(h * 0.22);
  roundedRect(px, W, H, tx, h * 0.28, h * 2.2, h * 0.22, 3, TEXT, 0.9);
  roundedRect(px, W, H, tx, h * 0.6, h * 3.4, h * 0.13, 2, TEXT_DIM, 0.65);

  const pillW = h * 0.62;
  const pillH = h * 0.44;
  const pillY = (h - pillH) / 2;
  for (let i = 0; i < controls; i++) {
    const x = W - pad - (controls - i) * (pillW + h * 0.14) + h * 0.14;
    roundedRect(px, W, H, x, pillY, pillW, pillH, pillH / 2, SURFACE_2, 1);
    roundedRect(px, W, H, x, pillY, pillW, pillH, pillH / 2, BORDER, 0.6);
    dot(px, W, H, x + pillH / 2, pillY + pillH / 2, pillH * 0.2, TEXT_DIM, 0.8);
  }
}

/** A labelled form field: a caption bar above a filled input. */
function field(px, W, H, x, y, w, h, filled) {
  roundedRect(px, W, H, x, y, w * 0.34, Math.max(2, h * 0.16), 2, TEXT_DIM, 0.7);
  roundedRect(px, W, H, x, y + h * 0.34, w, h * 0.56, 8, SURFACE_2, 1);
  roundedRect(px, W, H, x, y + h * 0.34, w, h * 0.56, 8, BORDER, 0.55);
  if (filled) {
    roundedRect(px, W, H, x + w * 0.06, y + h * 0.55, w * 0.3, h * 0.16, 2, TEXT, 0.75);
    // The unit, right-aligned in the field — the app labels every value.
    roundedRect(px, W, H, x + w * 0.78, y + h * 0.55, w * 0.16, h * 0.16, 2, ACCENT, 0.9);
  }
}

function drawShot(W, H, { narrow }) {
  const px = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const c = mix(mix(BG, SURFACE, 0.55), BG, y / H);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      px[i] = Math.round(c[0]); px[i + 1] = Math.round(c[1]); px[i + 2] = Math.round(c[2]); px[i + 3] = 255;
    }
  }

  const pad = Math.round(W * (narrow ? 0.055 : 0.04));
  const barH = Math.round(H * (narrow ? 0.062 : 0.1));
  drawTopbar(px, W, H, pad, barH, narrow ? 2 : 5);

  const accentAt = (r, c) => (r === 3 && c === 6) || (r === 4 && c === 9) || (r === 1 && c === 16);

  if (narrow) {
    // Top: the form card. Middle: the periodic table. Bottom: the calculator
    // sheet, which is how the app behaves on a phone. The three heights are
    // chosen so nothing overlaps the sheet — it is a bottom sheet, not a float.
    const ip = (W - pad * 2) * 0.06;
    const fw = W - pad * 2 - ip * 2;

    const cardH = H * 0.27;
    const cy = barH + pad;
    roundedRect(px, W, H, pad, cy, W - pad * 2, cardH, 16, SURFACE, 1);
    roundedRect(px, W, H, pad, cy, W - pad * 2, cardH, 16, BORDER, 0.55);
    const fh = cardH * 0.22;
    for (let r = 0; r < 3; r++) {
      field(px, W, H, pad + ip, cy + ip + r * (fh * 1.3), fw, fh, r < 2);
    }

    const ch = H * 0.22;
    const ey = cy + cardH + pad;
    const eh = H - ch - pad * 3 - ey;
    roundedRect(px, W, H, pad, ey, W - pad * 2, eh, 16, SURFACE, 1);
    roundedRect(px, W, H, pad, ey, W - pad * 2, eh, 16, BORDER, 0.55);
    drawElements(px, W, H, pad + ip * 0.5, ey + eh * 0.08, W - pad * 2 - ip, eh * 0.84, accentAt);

    drawCalc(px, W, H, pad, H - ch - pad, W - pad * 2, ch);
  } else {
    /*
     * The app's own shape: the periodic table as the main pane, a rail down the
     * right holding the form, and the calculator floating above the rail — the
     * one element that is allowed to overlap, because it is the one element
     * that is draggable.
     */
    const railW = W * 0.29;
    const gap = pad;
    const mainW = W - pad * 2 - railW - gap;
    const ey = barH + pad;
    const eh = H - ey - pad * 1.3;

    roundedRect(px, W, H, pad, ey, mainW, eh, 16, SURFACE, 1);
    roundedRect(px, W, H, pad, ey, mainW, eh, 16, BORDER, 0.55);
    drawElements(px, W, H, pad + mainW * 0.025, ey + eh * 0.09, mainW * 0.95, eh * 0.82, accentAt);

    const rx = pad + mainW + gap;
    roundedRect(px, W, H, rx, ey, railW, eh, 16, SURFACE, 1);
    roundedRect(px, W, H, rx, ey, railW, eh, 16, BORDER, 0.55);
    /*
     * The rail is filled top-down — fields, then the primary button — and the
     * calculator takes whatever is left. Computing the calc's height from the
     * space that remains, rather than as a fraction of the rail, is what keeps
     * the two from overlapping when the field height is tuned.
     */
    const ip2 = railW * 0.09;
    const fh = eh * 0.15;
    const step = fh * 1.3;
    let ry = ey + ip2;
    for (let r = 0; r < 2; r++) {
      field(px, W, H, rx + ip2, ry, railW - ip2 * 2, fh, true);
      ry += step;
    }
    roundedRect(px, W, H, rx + ip2, ry, (railW - ip2 * 2) * 0.46, fh * 0.62, 8, ACCENT, 1);
    ry += fh * 0.62 + ip2 * 1.1;

    const cw = railW * 0.92;
    const chh = ey + eh - ry - ip2 * 0.5;
    const cxp = rx + railW - cw - ip2 * 0.3;
    drawCalc(px, W, H, cxp, ry, cw, chh);
  }

  return px;
}

const outDir = path.join(process.cwd(), 'public');
fs.mkdirSync(outDir, { recursive: true });

/*
 * The two form factors Chrome asks for. 1280×720 is the "wide" screenshot and
 * 720×1280 the "narrow" one; both are the sizes the manifest spec names, so a
 * browser does not have to scale them.
 */
const SHOTS = [
  { name: 'screenshot-wide.png', w: 1280, h: 720, narrow: false },
  { name: 'screenshot-narrow.png', w: 720, h: 1280, narrow: true },
];

for (const { name, w, h, narrow } of SHOTS) {
  const png = encodePng(w, h, drawShot(w, h, { narrow }));
  fs.writeFileSync(path.join(outDir, name), png);
  console.log(`  ${name}  ${w}×${h}  ${png.length} bytes`);
}

// The mark alone, for a store listing tile that wants it on a transparent
// background rather than on the icon plate.
{
  const size = 512;
  const png = encodePng(size, size, drawIcon(size, { maskable: true }));
  fs.writeFileSync(path.join(outDir, 'store-icon.png'), png);
  console.log(`  store-icon.png  ${size}×${size}  ${png.length} bytes`);
}
