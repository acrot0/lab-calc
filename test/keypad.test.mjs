import { describe, expect, it } from 'vitest';
import {
  DIGIT_KEYS, FN_PAGES, MEMORY_KEYS, UNIT_KEYS, ZONE, allKeys,
} from '../src/ui/components/calculator-keys.mjs';
import { isExpressionFragment, evaluate } from '../src/calc/expression.mjs';

/*
 * The keypad has two function pages that swap while the memory row and the
 * digit block stay put. That arrangement is easy to break by moving a key from
 * one table to another: the page renders, the tests pass, and a user on the
 * second page finds there is no way to clear the entry or type a number.
 *
 * These lock the arrangement rather than the appearance.
 */

const labels = (rows) => rows.flat().map((k) => k.label);
const fnLabels = () => FN_PAGES.flatMap(labels);

describe('calculator keypad layout', () => {
  it('should keep every digit on the shared block so both pages can type numbers', () => {
    const pad = labels(DIGIT_KEYS);
    for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.']) {
      expect(pad).toContain(d);
    }
    // And nowhere else, or the digit would move when the function page swaps.
    for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(fnLabels()).not.toContain(d);
    }
  });

  it('should keep clear, backspace and brackets on the shared block', () => {
    // Clear and backspace are entry controls. On a function page they would
    // disappear when the page swapped, which is how a user gets stuck.
    const pad = labels(DIGIT_KEYS);
    expect(pad).toContain('C');
    expect(pad).toContain('⌫');
    expect(pad).toContain('(');
    expect(pad).toContain(')');
    expect(fnLabels()).not.toContain('C');
    expect(fnLabels()).not.toContain('⌫');
  });

  it('should keep the memory row off both function pages', () => {
    // `M+` and `ans` are recalls, not functions. A user reaching for them must
    // not have to know which page is showing.
    const mem = labels(MEMORY_KEYS);
    for (const k of ['ans', 'M+', 'M−', 'MR', 'MC']) expect(mem).toContain(k);
    for (const k of ['ans', 'M+', 'M−', 'MR', 'MC']) expect(fnLabels()).not.toContain(k);
  });

  it('should give every function page four rows of five columns', () => {
    // Equal shape, or the keypad jumps in height when the page is switched and
    // the digits move under the finger.
    for (const page of FN_PAGES) {
      expect(page).toHaveLength(4);
      for (const row of page) expect(row).toHaveLength(5);
    }
    for (const row of MEMORY_KEYS) expect(row).toHaveLength(5);
  });

  it('should offer a comma wherever a variadic function is offered', () => {
    // `hypot(`, `min(`, `max(` and `atan2(` open a call that needs more than
    // one argument. Without a comma key those are dead ends on a phone, where
    // the on-screen keypad is the only keyboard there is.
    const fnPage = fnLabels();
    const variadic = ['hypot', 'min', 'max', 'atan2'].filter((f) => fnPage.includes(f));
    expect(variadic.length).toBeGreaterThan(0);
    expect(fnPage).toContain(',');
  });

  it('should never put two keys with the same label on one page', () => {
    // Two identical labels in the same React list would also collide as keys.
    for (const [i, page] of FN_PAGES.entries()) {
      const l = labels(page);
      expect(new Set(l).size, `function page ${i + 1} has a duplicate label`).toBe(l.length);
    }
    for (const [name, rows] of [['digits', DIGIT_KEYS], ['memory', MEMORY_KEYS]]) {
      const l = labels(rows);
      expect(new Set(l).size, `${name} has a duplicate label`).toBe(l.length);
    }
  });

  it('should give every key a zone so the colour coding has something to key on', () => {
    const zones = new Set(Object.values(ZONE));
    const missing = allKeys().filter((k) => !zones.has(k.zone)).map((k) => k.label);
    expect(missing).toEqual([]);
  });

  it('should only insert text the expression parser could accept', () => {
    const rejects = allKeys()
      .filter((k) => k.insert)
      .filter((k) => !isExpressionFragment(k.insert))
      .map((k) => `${k.label} -> ${k.insert}`);
    expect(rejects).toEqual([]);
  });

  it('should only name actions the drawer implements', async () => {
    // The keypad declares its actions as strings and the drawer turns them into
    // behaviour. A string the drawer does not know is a key that silently does
    // nothing, which reads as a broken calculator rather than a missing feature.
    const { ACTIONS } = await import('../src/ui/components/calculator-actions.mjs');
    const known = new Set(Object.keys(ACTIONS));
    const unknown = allKeys()
      .filter((k) => k.action)
      .filter((k) => !known.has(k.action))
      .map((k) => `${k.label} -> ${k.action}`);
    expect(unknown).toEqual([]);
  });

  it('should give a tooltip to every key whose label is not self-explanatory', () => {
    // Digits are obvious; the abbreviations and the two log bases are not.
    const obvious = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.']);
    const missing = allKeys()
      .filter((k) => !obvious.has(k.label))
      .filter((k) => !k.title)
      .map((k) => k.label);
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

describe('calculator keypad units', () => {
  it('should offer only units the expression parser accepts', () => {
    for (const u of UNIT_KEYS) {
      expect(() => evaluate(`1 ${u}`), `1 ${u} does not parse`).not.toThrow();
    }
  });
});
