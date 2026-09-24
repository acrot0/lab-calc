import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fmt, fmtSci } from '../src/ui/format.mjs';

/**
 * Every user-visible string in the UI must come from the locale files.
 *
 * The preset chips are where this slipped: reagent names, solute names and
 * pKa presets were written as literals like '乙酸 / Acetate' in the component,
 * which reads fine in Chinese and ships Chinese text to an English user. The
 * build cannot see the problem — it is a valid string either way — so the check
 * has to be a scan.
 */

const DIRS = ['src/ui/tabs', 'src/ui/components'];

/** Strip comments and string-free lines, so only real code is inspected. */
function codeLines(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line, i) => [i + 1, line.replace(/\/\/.*$/, '')]);
}

/** CJK ideographs — the tell that a literal is written for one language only. */
const CJK = /[一-鿿]/;

function scan() {
  const hits = [];
  for (const dir of DIRS) {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.jsx')) continue;
      const path = join(dir, file);
      for (const [line, code] of codeLines(readFileSync(path, 'utf8'))) {
        const literals = code.match(/'[^']*'|"[^"]*"|`[^`]*`/g) ?? [];
        for (const lit of literals) {
          if (CJK.test(lit)) hits.push(`${path}:${line}  ${lit}`);
        }
      }
    }
  }
  return hits;
}

describe('UI strings', () => {
  it('should not hardcode Chinese text in components', () => {
    // A literal here reaches an English user untranslated. Every one of these
    // belongs in src/ui/locales/ instead.
    const hits = scan();
    expect(hits, `hardcoded CJK literals:\n${hits.join('\n')}`).toEqual([]);
  });

  it('should scan a directory that actually contains components', () => {
    // Guards against the scan silently passing because it looked nowhere.
    const total = DIRS.reduce((n, d) => n + readdirSync(d).filter((f) => f.endsWith('.jsx')).length, 0);
    expect(total).toBeGreaterThan(10);
  });

  it('should catch a literal the way the real ones were written', () => {
    // Proves the detector works rather than merely reporting no findings.
    expect(CJK.test("'乙酸 / Acetate'")).toBe(true);
    expect(CJK.test("'NaCl'")).toBe(false);
    expect(CJK.test('`${t("common.formula")} NaCl`')).toBe(false);
  });
});

/**
 * Quantities with no lower bound must not be rendered with fmt.
 *
 * fmt rounds to a fixed number of decimals, so any amount that can be small —
 * a mass, a mole count, a concentration — turns into "0" once it passes the
 * cutoff, and a zero reads as "nothing there" rather than "very little".
 * Quantities that genuinely have a floor (molar mass, a radius, a percentage,
 * a temperature in °C) are fine and are deliberately not flagged.
 */
describe('unbounded quantities', () => {
  /** Fields whose value can approach zero without meaning zero. */
  const UNBOUNDED = /massG|moles|molarity|conc|molality|osmolarity|extent|pmol|concNg|totalNg|totalPmol|ionicStrength|moleFraction|particles|copies/i;

  /**
   * Fields that look unbounded to the pattern but are not.
   *
   * A molar mass bottoms out around 1 g/mol, a Kelvin temperature around 1 K,
   * and a concentrated stock's molarity is bounded below by how dilute a
   * "concentrated" reagent can be — none of these reach the fmt cutoff, so
   * switching them to fmtSci would only churn the output.
   */
  const BOUNDED = /molarMass|tempK|stockMolarity|boilingPoint|freezingPoint|percent|volume|radius|rcow|rvdw|slope|intercept|r2|xMin|xMax|ph|pOH|kf|gamma|foldDilution|atm|kPa|deltaT/i;

  it('should render a trace amount with fmtSci, not fmt', () => {
    const offenders = [];
    for (const dir of DIRS) {
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.jsx'))) {
        const path = join(dir, file);
        const source = readFileSync(path, 'utf8');
        for (const [line, code] of codeLines(source)) {
          // fmtSci contains "fmt", so exclude it explicitly.
          if (!/\bfmt\(/.test(code.replace(/fmtSci\(/g, ''))) continue;
          if (!UNBOUNDED.test(code) || BOUNDED.test(code)) continue;
          // A field can be bounded in one place and not another — the same
          // `molarity` name holds a concentrated stock here and a trace
          // standard there. An explicit `Bounded:` marker records the
          // judgement at the call site instead of widening the pattern.
          const near = source.slice(Math.max(0, source.indexOf(code) - 400), source.indexOf(code));
          if (/Bounded:/.test(near.slice(-200))) continue;
          offenders.push(`${path}:${line}  ${code.trim()}`);
        }
      }
    }
    expect(offenders, `unbounded quantities rendered with fmt:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('should leave fmt and fmtSci agreeing on ordinary values', () => {
    // The substitution is only safe if fmtSci does not reformat normal
    // numbers; if it did, every one of these edits would be a visible change.
    for (const v of [58.44, 0.5, 12.08, 1500, 0.001, 1, 0, 100000]) {
      expect(fmtSci(v, 4), String(v)).toBe(fmt(v, 4));
    }
  });

  it('should show a microgram-scale preparation as a real mass', () => {
    // The case that motivated this: a 1 µM solution in 1 mL needs 5.8e-8 g.
    expect(fmt(5.844e-8, 3)).toBe('0');
    expect(fmtSci(5.844e-8, 3)).toBe('5.844×10⁻⁸');
  });
});
