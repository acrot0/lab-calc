import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/*
 * The illustration system's rules, enforced.
 *
 * `docs/illustration-system.md` is the source of truth; this is what makes it
 * true. The failure it exists to prevent already happened once: the first
 * version of `Illustrations.jsx` used eleven stroke widths — 1.2, 1.4, 1.5,
 * 1.6, 1.8, 2, 2.2, 2.4, 2.6, 3, 3.4 — each chosen by eye as "a bit heavier
 * here looks better". Every one was reasonable alone. Together they carried no
 * hierarchy at all, because adjacent steps differ by 1.07–1.17× and the eye
 * resolves weight differences at roughly 1.5×.
 *
 * That is an information defect, not a taste one. In technical drawing, line
 * weight is how a figure says what is outline, what is internal structure and
 * what is detail; ISO 128-2 requires at least 2:1 between a thick and a thin.
 * Eleven near-equal weights say nothing.
 *
 * So the widths are a closed set with 2:1 steps, and this test is what keeps
 * the next person from "just nudging one a little heavier".
 */

const ART = path.resolve(import.meta.dirname, '../src/ui/components/Illustrations.jsx');

/** The permitted weights: outline, structure, detail, and one emphasis. */
const ALLOWED_WIDTHS = [0.6, 1.2, 2.4, 3.6];

/** The ratio below which two weights are indistinguishable to the eye. */
const MIN_RATIO = 2;

const source = fs.readFileSync(ART, 'utf8');

/** Every `strokeWidth="N"` in the file, in source order. */
function strokeWidths(src) {
  return [...src.matchAll(/strokeWidth="([\d.]+)"/g)].map((m) => Number(m[1]));
}

describe('illustration stroke widths', () => {
  it('should use only the declared weights', () => {
    // A weight outside the set is the failure mode this file exists for: it is
    // how eleven steps accumulated one nudge at a time.
    const found = [...new Set(strokeWidths(source))].sort((a, b) => a - b);
    const stray = found.filter((w) => !ALLOWED_WIDTHS.includes(w));
    expect(stray, `线宽不在允许集合内：${stray.join(', ')}（见 docs/illustration-system.md）`).toEqual([]);
  });

  it('should separate any two weights it uses by at least 2:1', () => {
    /*
     * The rule that actually carries the hierarchy. Two weights closer than 2:1
     * are two weights the reader cannot tell apart, which means the figure is
     * claiming a distinction that does not render.
     */
    const found = [...new Set(strokeWidths(source))].sort((a, b) => a - b);
    const tooClose = [];
    for (let i = 1; i < found.length; i += 1) {
      const ratio = found[i] / found[i - 1];
      if (ratio < MIN_RATIO) {
        tooClose.push(`${found[i - 1]} : ${found[i]} = ${ratio.toFixed(2)}:1`);
      }
    }
    expect(tooClose, `线宽比不足 ${MIN_RATIO}:1，读者分辨不出：${tooClose.join('；')}`).toEqual([]);
  });

  it('should use at least two weights, so the figure has a hierarchy', () => {
    // One weight is the opposite failure: technically consistent, and it tells
    // the reader nothing about what matters.
    const found = [...new Set(strokeWidths(source))];
    expect(found.length, '只有一种线宽，图里没有层次').toBeGreaterThanOrEqual(2);
  });

  it('should not use more than the four declared weights', () => {
    const found = [...new Set(strokeWidths(source))];
    expect(found.length, `用了 ${found.length} 种线宽，超过就不再是层次而是噪声`).toBeLessThanOrEqual(ALLOWED_WIDTHS.length);
  });
});

describe('illustration colours', () => {
  it('should not hard-code a colour', () => {
    /*
     * Every colour is a CSS variable so one drawing serves all ten themes and
     * both light and dark. A literal `#3b82f6` looks right in the theme it was
     * written against and wrong in the other nine.
     *
     * `white` is the one exception: it is the glass highlight, and a highlight
     * is white in every theme — tinting it with the accent would make it read
     * as coloured glass rather than as light.
     */
    const literals = [...source.matchAll(/(?:fill|stroke|stopColor)="(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-z]+)"/g)]
      .map((m) => m[1])
      .filter((v) => v !== 'none' && v !== 'currentColor' && v !== 'white');
    expect(literals, `写死的颜色：${[...new Set(literals)].join(', ')}`).toEqual([]);
  });
});

describe('illustration gradients', () => {
  it('should give every gradient id a per-instance hook', () => {
    /*
     * Gradient ids must be unique per mounted instance. React renders these in
     * more than one place, and duplicate ids mean the second `<linearGradient>`
     * is ignored and the first one's colours are used — invisible until two
     * instances are compared side by side.
     *
     * The hook is called once at the top of each component, never inside JSX:
     * a hook in a JSX expression is a Rules-of-Hooks violation, and calling it
     * several times per render would return several ids, so the defs and the
     * references pointing at them would disagree and every gradient would
     * silently render as none.
     */
    const components = [...source.matchAll(/export function (Art\w+)\(\)/g)].map((m) => m[1]);
    expect(components.length, '没有找到任何 Art 组件').toBeGreaterThan(0);
    for (const name of components) {
      const body = source.slice(source.indexOf(`export function ${name}()`));
      const end = body.indexOf('\nexport function', 10);
      const chunk = end > 0 ? body.slice(0, end) : body;
      const calls = [...chunk.matchAll(/useGradientId\(\)/g)].length;
      expect(calls, `${name} 调用 useGradientId ${calls} 次，应为 1 次`).toBe(1);
    }
  });
});
