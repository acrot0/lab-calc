import { describe, expect, it } from 'vitest';
import { COMMON_KEYS, FN_KEYS, PAD_KEYS } from '../src/ui/components/CalculatorDrawer.jsx';
import { isExpressionFragment } from '../src/calc/expression.mjs';

/*
 * The keypad has two function pages that swap while the digit block stays put.
 * That arrangement is easy to break by moving a key from one table to another:
 * the page renders, the tests pass, and a user on the second page finds there
 * is no way to clear the entry or type a number.
 *
 * These lock the arrangement rather than the appearance.
 */

const labels = (rows) => rows.flat().map((k) => k.label);
const allKeys = () => [...COMMON_KEYS, ...FN_KEYS, ...PAD_KEYS].flat();

describe('calculator keypad layout', () => {
  it('should keep every digit on the shared block so both pages can type numbers', () => {
    const pad = labels(PAD_KEYS);
    for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.']) {
      expect(pad).toContain(d);
    }
    // And nowhere else, or the digit would move when the function page swaps.
    const fn = [...labels(COMMON_KEYS), ...labels(FN_KEYS)];
    for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(fn).not.toContain(d);
    }
  });

  it('should keep clear, backspace and brackets on the shared block', () => {
    /*
     * `(` and `)` are the exception: the common page also carries them, next to
     * `mod` and `%`, where a user writing `(1+2)*3` expects to find them. That
     * duplication is harmless because the shared block draws last, so the key
     * does not move when the pages swap — which is the property that matters.
     * Clear and backspace have no such excuse and must appear exactly once.
     */
    const pad = labels(PAD_KEYS);
    expect(pad).toContain('C');
    expect(pad).toContain('⌫');
    expect(pad).toContain('(');
    expect(pad).toContain(')');
    const fn = [...labels(COMMON_KEYS), ...labels(FN_KEYS)];
    expect(fn).not.toContain('C');
    expect(fn).not.toContain('⌫');
  });

  it('should give both function pages four rows of five columns', () => {
    for (const page of [COMMON_KEYS, FN_KEYS]) {
      expect(page).toHaveLength(4);
      for (const row of page) expect(row).toHaveLength(5);
    }
  });

  it('should offer a comma wherever a variadic function is offered', () => {
    // `hypot(`, `min(`, `max(` and `atan2(` open a call that needs more than
    // one argument. Without a comma key those are dead ends on a phone, where
    // the on-screen keypad is the only keyboard there is.
    const fnPage = labels(FN_KEYS);
    const variadic = ['hypot', 'min', 'max', 'atan2'].filter((f) => fnPage.includes(f));
    expect(variadic.length).toBeGreaterThan(0);
    expect(fnPage).toContain(',');
  });

  it('should never put two keys with the same label on one page', () => {
    // Two identical labels in the same React list would also collide as keys.
    for (const [name, page] of [['common', COMMON_KEYS], ['functions', FN_KEYS]]) {
      const l = labels(page);
      expect(new Set(l).size, `${name} page has a duplicate label`).toBe(l.length);
    }
    const pad = labels(PAD_KEYS);
    expect(new Set(pad).size).toBe(pad.length);
  });

  it('should only insert text the expression parser could accept', () => {
    const rejects = allKeys()
      .filter((k) => k.insert)
      .filter((k) => !isExpressionFragment(k.insert))
      .map((k) => `${k.label} -> ${k.insert}`);
    expect(rejects).toEqual([]);
  });

  it('should give a tooltip to every key whose label is not self-explanatory', () => {
    // Digits are obvious; the abbreviations and the two log bases are not.
    const needsTitle = allKeys().filter((k) => /^(mod|min|max|hypot|atan2|log2|log10|10ˣ|,|round|floor|ceil|trunc|sign|cbrt|abs|exp|ln|log|asin|acos|atan|power|square|sqrt|percent)$/.test(k.label));
    const missing = needsTitle.filter((k) => !k.title).map((k) => k.label);
    expect(missing).toEqual([]);
  });

  it('should give every titled key a locale string in both locales', async () => {
    const { zh } = await import('../src/ui/locales/zh.mjs');
    const { en } = await import('../src/ui/locales/en.mjs');
    const missing = [];
    for (const k of allKeys()) {
      if (!k.title) continue;
      for (const [name, table] of [['zh', zh], ['en', en]]) {
        if (typeof table.convert?.[`calcKey_${k.title}`] !== 'string') {
          missing.push(`${name}: calcKey_${k.title} (${k.label})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});