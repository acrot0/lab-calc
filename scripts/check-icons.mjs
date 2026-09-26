/**
 * Check the icon set against the measurement table.
 *
 * Three things can go wrong with a hand-maintained table of measurements, and
 * all three are silent in a browser:
 *
 * - an icon is added and never measured, so it renders at Phosphor's size and
 *   looks wrong next to its neighbours;
 * - the table has an entry no icon uses, which means a rename left the old
 *   measurement behind and the new name is unmeasured;
 * - an entry's numbers drift from the glyph, which happens when Phosphor
 *   updates and moves a path.
 *
 * The first two are checked here by name. The third needs a browser to measure
 * the actual paths, which this project has no headless dependency for — so
 * `tools/icon-audit.html` prints the current table, and this script checks the
 * shapes of the two against each other by reporting how far the stored centre
 * is from the grid centre. A glyph that has moved shows up as a suspicious
 * offset rather than as a wrong render.
 *
 * Run: `npm run icons:check`
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ICON_INK, normalize } from '../src/ui/icon-metrics.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The `name: styled(PhosphorName, 'key')` pairs in `icons.jsx`. */
function readIconKeys() {
  const source = fs.readFileSync(path.join(ROOT, 'src/ui/icons.jsx'), 'utf8');
  const body = source.slice(source.indexOf('export const Icons'));
  return [...body.matchAll(/(\w+): styled\((\w+)(?:, '([^']*)')?\)/g)]
    .map((m) => ({ name: m[1], key: m[3] ?? null }));
}

const problems = [];
const icons = readIconKeys();

if (icons.length === 0) {
  problems.push('no icons found in icons.jsx — the parsing pattern is stale');
}

for (const { name, key } of icons) {
  if (!key) {
    problems.push(`${name}: no measurement key passed to styled()`);
    continue;
  }
  if (key !== name) {
    problems.push(`${name}: styled() is keyed '${key}', which is a different icon`);
  }
  if (!ICON_INK[key]) {
    problems.push(`${name}: not in ICON_INK — run the audit page and add it`);
  }
}

const used = new Set(icons.map((i) => i.key).filter(Boolean));
for (const key of Object.keys(ICON_INK)) {
  if (!used.has(key)) {
    problems.push(`${key}: measured but no icon uses it — a stale entry from a rename?`);
  }
}

/*
 * A glyph whose ink centre is far from the grid centre is either one Phosphor
 * drew off-centre (which is the reason this file exists) or a measurement that
 * no longer matches the path. The threshold is generous — `colligative` is
 * legitimately 20 units off — so this only catches a number that is wrong by
 * enough to be a typo rather than a real asymmetry.
 */
for (const [key, ink] of Object.entries(ICON_INK)) {
  const cx = ink.x + ink.w / 2;
  const cy = ink.y + ink.h / 2;
  const off = Math.hypot(cx - 128, cy - 128);
  if (off > 40) {
    problems.push(`${key}: ink centre (${cx}, ${cy}) is ${off.toFixed(1)} from the grid centre — measured from the wrong glyph?`);
  }
  if (ink.x < -1 || ink.y < -1 || ink.x + ink.w > 257 || ink.y + ink.h > 257) {
    problems.push(`${key}: ink box (${ink.x}, ${ink.y}, ${ink.w}×${ink.h}) falls outside the 256 grid`);
  }
}

/*
 * The normalised viewBoxes should all show the same fraction of ink. If one
 * does not, the arithmetic in `normalize` has a bug — checked here rather than
 * only in the unit test because this is the script a maintainer runs.
 */
for (const [key, ink] of Object.entries(ICON_INK)) {
  const vb = normalize(key);
  if (!vb) {
    problems.push(`${key}: normalize() returned nothing for a measured glyph`);
    continue;
  }
  const [minX, minY, w, h] = vb.split(' ').map(Number);
  if (!(w > 0) || !(h > 0) || w !== h) {
    problems.push(`${key}: viewBox ${vb} is not a positive square`);
  }
  // The ink must sit inside the region, centred, and fill the same fraction of
  // every glyph — which is the property that makes them read as one set.
  const expectedFill = 0.84;
  const filled = Math.max(ink.w, ink.h) / w;
  if (Math.abs(filled - expectedFill) > 0.001) {
    problems.push(`${key}: ink fills ${filled.toFixed(3)} of the viewBox, expected ${expectedFill}`);
  }
  const inkCx = ink.x + ink.w / 2;
  const boxCx = minX + w / 2;
  if (Math.abs(inkCx - boxCx) > 0.01 || Math.abs((ink.y + ink.h / 2) - (minY + h / 2)) > 0.01) {
    problems.push(`${key}: ink is not centred in its viewBox`);
  }
}

if (problems.length > 0) {
  console.error(`icon check failed (${problems.length}):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log(`icon check passed: ${icons.length} icons, all measured and normalised`);
