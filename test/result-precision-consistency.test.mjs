import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';

/*
 * One `Result` panel must not state a quantity at two precisions.
 *
 * Measured on the shipped build, the colligative tab's osmotic mode:
 *
 *     headline   7.3396 atm     ← fmt(shown.atm, 4)      5 significant figures
 *     row below  743.687 kPa    ← fmt(shown.kPa, 3)      6 significant figures
 *
 * Those are the same pressure — 7.3396211 × 101.325 = 743.6871 — printed twice
 * in one panel at two different resolutions. The row claims a digit the
 * headline above it denies, which is exactly the confusion a significant-figure
 * display is supposed to prevent.
 *
 * ## Why this test is about call sites and not about a formatting function
 *
 * The formatter is not broken. `fmt(v, d)` caps the decimals and trims trailing
 * zeros, so `fmt(2, 3)` is `2` and not `2.000` — the right behaviour for an
 * exact count. What went wrong is that twenty tabs each picked their own `d`
 * per call, and the picks disagree *within a panel*.
 *
 * ## What this does NOT flag, and why
 *
 * Two neighbouring patterns look like the defect and are not:
 *
 * - **A headline against the worked steps.** The steps are the derivation and
 *   the headline is the answer; the steps are meant to carry more digits.
 * - **A display value against a `raw*` row.** The uncertainty tab prints
 *   `rawUnc` at 8 digits deliberately — "raw" is the point of that row — beside
 *   a headline rounded to 6.
 *
 * An earlier version of this test used a character window and flagged both,
 * which would have had me "fix" two correct panels. So the scan is anchored on
 * the `Result` element itself: the digits in its `value` and `note` props must
 * agree with the digits in its `rows`, for the same expression. Anything
 * outside that element is a different context by construction.
 */


const TAB_DIR = 'src/ui/tabs';

/** `fmt(expr, digits)` and `fmtSci(expr, digits)` calls, with their offsets. */
function formatCalls(source) {
  const out = [];
  for (const m of source.matchAll(/fmt(?:Sci)?\(([^,]+),\s*(\d+)\)/g)) {
    out.push({ expr: m[1].trim(), digits: Number(m[2]), at: m.index });
  }
  return out;
}

/**
 * The `Result` elements in a file, as source slices.
 *
 * Matched from the opening `<Result` to the self-closing `/>` that ends it.
 * `Result` is always self-closing in this codebase — it renders its own
 * wrapper — so the first `/>` after the tag opens is its end. A tab that ever
 * writes `<Result>...</Result>` with children would not be matched, and the
 * assertion below fails on the empty-result guard rather than passing quietly.
 */
function resultBlocks(source) {
  const blocks = [];
  for (const m of source.matchAll(/<Result\b[\s\S]*?\/>/g)) blocks.push(m[0]);
  return blocks;
}

/**
 * Expressions inside one `Result` formatted at two precisions.
 *
 * Scans only the `value`, `note` and `rows` props — the parts a reader sees as
 * one panel. `worked` is excluded on purpose: the derivation is meant to carry
 * more digits than the answer above it.
 */
function panelConflicts(block) {
  const panel = block
    .replace(/\bworked=\{[^]*?\}\}/, '')   // drop the worked prop when inline
    .replace(/\bworked=\{[^\n]*$/, '');
  const seen = new Map();
  for (const c of formatCalls(panel)) {
    if (!seen.has(c.expr)) seen.set(c.expr, new Set());
    seen.get(c.expr).add(c.digits);
  }
  const out = [];
  for (const [expr, digits] of seen) {
    if (digits.size > 1) out.push(`${expr}  ${[...digits].join(' vs ')}`);
  }
  return out;
}

describe('result panel precision', () => {
  const tabs = readdirSync(TAB_DIR).filter((f) => f.endsWith('.jsx'));

  it('should find tabs to check', () => {
    expect(tabs.length).toBeGreaterThan(10);
  });

  it('should find Result blocks to check', () => {
    // A guard on the guard: if the JSX shape changed so nothing matched, the
    // conflict assertion below would pass by having nothing to look at.
    let blocks = 0;
    for (const file of tabs) {
      blocks += resultBlocks(readFileSync(`${TAB_DIR}/${file}`, 'utf8')).length;
    }
    expect(blocks).toBeGreaterThan(20);
  });

  it('should not format one expression at two precisions in one panel', () => {
    const offenders = [];
    for (const file of tabs) {
      const source = readFileSync(`${TAB_DIR}/${file}`, 'utf8');
      for (const block of resultBlocks(source)) {
        for (const c of panelConflicts(block)) offenders.push(`${file}: ${c}`);
      }
    }
    expect(offenders, `same quantity, two precisions, one panel:\n${offenders.join('\n')}`).toEqual([]);
  });
});

describe('unit pairs of one quantity', () => {
  /*
   * The second shape the defect takes, and the one that started this file.
   *
   * Colligative osmotic mode printed the same pressure twice — `7.3396 atm` as
   * the headline and `743.687 kPa` in the row below. Both are 5 and 6
   * significant figures of one number (7.3396211 × 101.325 = 743.6871), so the
   * row claimed a digit the headline denied.
   *
   * The expression-based check above cannot see this: `shown.atm` and
   * `shown.kPa` are different expressions, and a scanner cannot know that two
   * names are the same physical quantity in different units. So the pairing is
   * stated here as data — the conversions this app actually displays — and the
   * test asserts the two sides of each pair are shown at a matching number of
   * significant figures.
   */
  const PAIRS = [
    {
      file: 'ColligativeTab.jsx',
      a: { expr: 'shown.atm', unit: 'atm' },
      b: { expr: 'shown.kPa', unit: 'kPa' },
      // 1 atm = 101.325 kPa exactly (definition).
      ratio: 101.325,
    },
  ];

  /** Significant figures in a formatted number string. */
  const sigFigs = (s) => {
    const digits = String(s).replace(/^-/, '').replace('.', '').replace(/^0+/, '').replace(/0+$/, '');
    return digits.length || 1;
  };

  it('should show both sides of a unit pair at the same significant figures', () => {
    const offenders = [];
    for (const { file, a, b, ratio } of PAIRS) {
      const source = readFileSync(`${TAB_DIR}/${file}`, 'utf8');
      const digitsOf = (expr) => {
        // The digit count the tab passes for this expression, or null.
        const escaped = expr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const m = new RegExp(`${escaped},\\s*(\\d+)\\)`).exec(source);
        return m ? Number(m[1]) : null;
      };
      const da = digitsOf(a.expr);
      const db = digitsOf(b.expr);
      if (da === null || db === null) {
        offenders.push(`${file}: could not read digits for ${a.expr} / ${b.expr}`);
        continue;
      }
      // Compare at a representative magnitude. Any value works: significant
      // figures of a fixed decimal count depend on the magnitude, and the
      // point is that the two sides agree at the size the app actually shows.
      const va = 7.339621109111466;
      const vb = va * ratio;
      const sa = sigFigs(va.toFixed(da));
      const sb = sigFigs(vb.toFixed(db));
      if (sa !== sb) offenders.push(`${file}: ${a.expr} → ${sa} sig figs, ${b.expr} → ${sb}`);
    }
    expect(offenders, `one quantity, two precisions:\n${offenders.join('\n')}`).toEqual([]);
  });
});
