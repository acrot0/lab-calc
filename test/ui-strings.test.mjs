import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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
