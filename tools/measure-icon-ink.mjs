/**
 * Measure the ink box of Phosphor glyphs straight from their path data.
 *
 * `tools/icon-audit.html` measures in a browser with `getBBox`, which is exact
 * and needs a page and a human. This does it in Node by walking the path
 * commands, so it can run from a script.
 *
 * ## Arcs
 *
 * Most Phosphor glyphs are built from elliptical arcs, so a parser that skips
 * them measures nothing at all — the first version of this script reported "no
 * path data" for two thirds of the set for exactly that reason. The endpoint
 * parameterisation is converted to centre form (SVG 1.1 appendix F.6.5) and
 * each arc is sampled, which puts the box within a fraction of a unit.
 *
 * ## Which weight
 *
 * The `regular` weight, which is Phosphor's own default and what a glyph draws
 * as when no weight is set. The table it feeds is a per-glyph geometric
 * correction, and the ink box moves with the weight — a `bold` measurement
 * applied to a `regular` render would be a correction for the wrong shape.
 *
 *   node tools/measure-icon-ink.mjs Sigma ChartScatter WaveSine Ruler
 */
import { readFileSync } from 'node:fs';

const round = (v) => Math.round(v * 100) / 100;

/** Split a path's `d` into absolute subpaths of sampled absolute points. */
function toAbsolute(d) {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const subpaths = [];
  let current = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let lastCtrlX = null;
  let lastCtrlY = null;
  let lastCmd = '';
  let i = 0;

  const num = () => Number(tokens[i++]);
  const push = (px, py) => { if (current) current.push([px, py]); };
  const nextIsNumber = () => i < tokens.length && !/[a-z]/i.test(tokens[i]);

  while (i < tokens.length) {
    const t = tokens[i];
    if (!/[a-z]/i.test(t)) { i++; continue; }
    lastCmd = t;
    i++;

    if (/[Zz]/.test(t)) {
      x = startX; y = startY;
      push(x, y);
      lastCtrlX = null; lastCtrlY = null;
      continue;
    }

    const rel = t === t.toLowerCase();

    if (/[Mm]/.test(t)) {
      let first = true;
      while (nextIsNumber()) {
        const nx = num(); const ny = num();
        if (rel) { x += nx; y += ny; } else { x = nx; y = ny; }
        if (first) {
          current = [[x, y]];
          subpaths.push(current);
          startX = x; startY = y;
          first = false;
        } else push(x, y);
      }
      lastCtrlX = null; lastCtrlY = null;
      continue;
    }

    const readPoint = () => {
      const nx = num(); const ny = num();
      if (rel) { x += nx; y += ny; } else { x = nx; y = ny; }
      return [x, y];
    };

    while (nextIsNumber()) {
      if (/[Hh]/.test(t)) {
        const nx = num();
        x = rel ? x + nx : nx;
        push(x, y);
        lastCtrlX = null; lastCtrlY = null;
      } else if (/[Vv]/.test(t)) {
        const ny = num();
        y = rel ? y + ny : ny;
        push(x, y);
        lastCtrlX = null; lastCtrlY = null;
      } else if (/[Ll]/.test(t)) {
        push(...readPoint());
        lastCtrlX = null; lastCtrlY = null;
      } else if (/[Cc]/.test(t)) {
        // Control points are sampled alongside the endpoint. A cubic stays
        // inside the hull of its four control points, so including them can
        // only overstate the box slightly — never clip it.
        const c1 = readPoint();
        const c2 = readPoint();
        const p = readPoint();
        push(...c1); push(...c2); push(...p);
        lastCtrlX = c2[0]; lastCtrlY = c2[1];
      } else if (/[Ss]/.test(t)) {
        const c1 = (lastCtrlX !== null && /[CcSs]/.test(lastCmd))
          ? [2 * x - lastCtrlX, 2 * y - lastCtrlY] : [x, y];
        const c2 = readPoint();
        const p = readPoint();
        push(...c1); push(...c2); push(...p);
        lastCtrlX = c2[0]; lastCtrlY = c2[1];
      } else if (/[Qq]/.test(t)) {
        const c1 = readPoint();
        const p = readPoint();
        push(...c1); push(...p);
        lastCtrlX = c1[0]; lastCtrlY = c1[1];
      } else if (/[Tt]/.test(t)) {
        const c1 = (lastCtrlX !== null && /[QqTt]/.test(lastCmd))
          ? [2 * x - lastCtrlX, 2 * y - lastCtrlY] : [x, y];
        const p = readPoint();
        push(...c1); push(...p);
        lastCtrlX = c1[0]; lastCtrlY = c1[1];
      } else if (/[Aa]/.test(t)) {
        const rx = num(); const ry = num(); const rot = num();
        const large = num(); const sweep = num();
        const p = readPoint();
        for (const [ax, ay] of sampleArc(x, y, rx, ry, rot, large, sweep, p[0], p[1])) {
          push(ax, ay);
        }
        // The endpoint has already been written back into x,y by readPoint.
        lastCtrlX = null; lastCtrlY = null;
      } else {
        break;
      }
    }
  }
  return subpaths;
}

/**
 * Sample an SVG elliptical arc as absolute points.
 *
 * The endpoint-to-centre conversion from SVG 1.1 F.6.5. The radii are scaled up
 * when they are too small to span the endpoints — the spec's own correction,
 * and the reason a glyph can specify a radius that seems not to fit.
 */
function sampleArc(x1, y1, rx, ry, rotDeg, largeArc, sweep, x2, y2, steps = 24) {
  if (rx === 0 || ry === 0) return [[x2, y2]];
  const phi = (rotDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  let rxa = Math.abs(rx);
  let rya = Math.abs(ry);
  const lambda = (x1p * x1p) / (rxa * rxa) + (y1p * y1p) / (rya * rya);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rxa *= s;
    rya *= s;
  }

  const sign = largeArc === sweep ? -1 : 1;
  const numer = rxa * rxa * rya * rya - rxa * rxa * y1p * y1p - rya * rya * x1p * x1p;
  const denom = rxa * rxa * y1p * y1p + rya * rya * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, numer / denom));
  const cxp = (co * rxa * y1p) / rya;
  const cyp = (-co * rya * x1p) / rxa;

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const angle = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    const a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    return (ux * vy - uy * vx < 0 ? -a : a);
  };

  const ux = (x1p - cxp) / rxa;
  const uy = (y1p - cyp) / rya;
  const vx = (-x1p - cxp) / rxa;
  const vy = (-y1p - cyp) / rya;
  const theta1 = angle(1, 0, ux, uy);
  let delta = angle(ux, uy, vx, vy);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  const out = [];
  for (let s = 0; s <= steps; s++) {
    const theta = theta1 + (delta * s) / steps;
    out.push([
      cx + rxa * Math.cos(theta) * cosPhi - rya * Math.sin(theta) * sinPhi,
      cy + rxa * Math.cos(theta) * sinPhi + rya * Math.sin(theta) * cosPhi,
    ]);
  }
  return out;
}

/** The ink box of one glyph, at the `regular` weight. */
export function measure(name) {
  const file = `node_modules/@phosphor-icons/react/dist/defs/${name}.es.js`;
  const src = readFileSync(file, 'utf8');

  /*
   * The defs module is a Map of weight -> element tree. Only the `regular`
   * entry is measured: the table is a geometric correction and the ink box
   * moves with the weight, so a bold measurement applied to a regular render
   * would correct for the wrong shape.
   */
  const regularStart = src.indexOf('"regular"');
  if (regularStart < 0) throw new Error(`no regular weight in ${name}`);
  // Up to the next weight key, or the end of the file.
  const rest = src.slice(regularStart + 9);
  const nextWeight = rest.search(/"\w+",\s*\/\* @__PURE__ \*\/ \w+\.createElement/);
  const block = nextWeight < 0 ? rest : rest.slice(0, nextWeight);

  const ds = [...block.matchAll(/d:\s*"([^"]+)"/g)].map((m) => m[1]);
  if (!ds.length) throw new Error(`no path data in ${name}`);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of ds) {
    for (const sub of toAbsolute(d)) {
      for (const [px, py] of sub) {
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
    }
  }
  if (!Number.isFinite(minX)) throw new Error(`nothing measurable in ${name}`);
  return { x: round(minX), y: round(minY), w: round(maxX - minX), h: round(maxY - minY) };
}

if (process.argv[1]?.endsWith('measure-icon-ink.mjs')) {
  const names = process.argv.slice(2);
  if (!names.length) {
    console.error('usage: node tools/measure-icon-ink.mjs <IconName> [...]');
    process.exit(1);
  }
  for (const name of names) {
    try {
      const ink = measure(name);
      console.log(`  ${name}: { x: ${ink.x}, y: ${ink.y}, w: ${ink.w}, h: ${ink.h} },`);
    } catch (e) {
      console.log(`  ${name}: ERROR ${e.message}`);
    }
  }
}
