import { describe, it, expect } from 'vitest';
import { unitLabel, unitsOf, DIMENSIONS, UNITS } from '../src/calc/units.mjs';

/**
 * Unit names in the reader's language.
 *
 * The registry has carried `name: { zh, en }` for every unit since it was
 * written — 「克」 beside `g`, 「毫克」 beside `mg`. Nothing read it. The
 * converter's pickers rendered the symbol alone, so a card showed 「质量」 in
 * the dimension dropdown and `kg, g, mg` in the unit dropdowns beneath it:
 * two languages in one panel, and the Chinese one only where it was least
 * needed (the user picked the dimension first and knows what it is).
 *
 * `unitLabel` is the accessor that was missing. It reads the registry rather
 * than a second hand-written table, so a unit added there is named here
 * without an edit — the same single-source rule the rest of the module follows.
 */
describe('unitLabel', () => {
  it('should name a unit in Chinese, with its symbol', () => {
    expect(unitLabel('g', 'mass', 'zh')).toBe('克 (g)');
  });

  it('should name the same unit in English', () => {
    expect(unitLabel('g', 'mass', 'en')).toBe('gram (g)');
  });

  it('should name units whose symbol is not their English word', () => {
    // `mg` is not "mg" spelled out; the name is what makes the picker readable.
    expect(unitLabel('mg', 'mass', 'zh')).toBe('毫克 (mg)');
    expect(unitLabel('ug', 'mass', 'en')).toBe('microgram (ug)');
  });

  it('should resolve an ambiguous symbol by the dimension it was asked about', () => {
    // `A` is the ampere and the ångström. A user who picked 「长度」 means the
    // ångström; a bare lookup would name it 安培.
    expect(unitLabel('A', 'length', 'zh')).toContain('埃');
    expect(unitLabel('A', 'current', 'zh')).toContain('安');
  });

  it('should name every unit the pickers can offer, in both languages', () => {
    // The pickers list `unitsOf(dim)` for all 35 dimensions. A unit that
    // reaches a picker without a name is a row reading `(sym)`.
    for (const dim of Object.keys(DIMENSIONS)) {
      for (const sym of unitsOf(dim)) {
        for (const loc of ['zh', 'en']) {
          const label = unitLabel(sym, dim, loc);
          expect(label, `${dim}/${sym}/${loc}`).toContain(sym);
          expect(label, `${dim}/${sym}/${loc} has no name`).not.toBe(` (${sym})`);
        }
      }
    }
  });

  it('should fall back to the bare symbol for something it cannot name', () => {
    // Never reached through a picker, but a missing name must not render as
    // "undefined" or an empty row.
    expect(unitLabel('nope', 'mass', 'zh')).toBe('nope');
    expect(unitLabel('g', 'notADimension', 'zh')).toBe('g');
  });

  it('should default to Chinese, which is the app default', () => {
    expect(unitLabel('g', 'mass')).toBe('克 (g)');
  });
});
