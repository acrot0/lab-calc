import { describe, it, expect } from 'vitest';
import { ELEMENTS, elementBySymbol, ELEMENT_COUNT, gridPosition } from '../src/calc/elements.mjs';
import { ATOMIC_WEIGHTS, molarMass } from '../src/calc/solution.mjs';

describe('element table', () => {
  it('should cover every element from 1 to 118', () => {
    const numbers = ELEMENTS.map((e) => e.number).sort((a, b) => a - b);
    expect(numbers[0]).toBe(1);
    expect(numbers[numbers.length - 1]).toBe(118);
    // No gaps: a hole would render as a blank cell nobody notices.
    for (let i = 0; i < 118; i++) expect(numbers[i]).toBe(i + 1);
  });

  it('should have one entry per element', () => {
    expect(ELEMENTS).toHaveLength(118);
    expect(ELEMENT_COUNT).toBe(118);
  });

  it('should give every element a unique symbol', () => {
    const symbols = ELEMENTS.map((e) => e.symbol);
    expect(new Set(symbols).size).toBe(118);
  });

  it('should give every element a positive atomic mass', () => {
    for (const e of ELEMENTS) {
      expect(e.mass, `${e.symbol} mass`).toBeGreaterThan(0);
      expect(Number.isFinite(e.mass), `${e.symbol} mass finite`).toBe(true);
    }
  });

  it('should place every element on the grid', () => {
    for (const e of ELEMENTS) {
      expect(e.group, `${e.symbol} group`).toBeGreaterThanOrEqual(1);
      expect(e.group, `${e.symbol} group`).toBeLessThanOrEqual(18);
      // Rows 1–7 are the main table. The f-block is conventionally drawn as
      // two detached rows below it, which are rows 9 and 10 here — the gap at
      // row 8 is what leaves the visual separation.
      expect(e.period, `${e.symbol} period`).toBeGreaterThanOrEqual(1);
      expect(e.period, `${e.symbol} period`).toBeLessThanOrEqual(10);
      expect(e.period, `${e.symbol} period`).not.toBe(8);
    }
  });

  it('should put the lanthanides and actinides on the detached rows', () => {
    // 15 elements each, drawn across groups 3–17.
    const lanthanides = ELEMENTS.filter((e) => e.period === 9);
    const actinides = ELEMENTS.filter((e) => e.period === 10);
    expect(lanthanides).toHaveLength(15);
    expect(actinides).toHaveLength(15);
    expect(lanthanides[0].symbol).toBe('La');
    expect(lanthanides[14].symbol).toBe('Lu');
    expect(actinides[0].symbol).toBe('Ac');
    expect(actinides[14].symbol).toBe('Lr');
  });

  it('should not place two elements in the same grid cell', () => {
    // A collision means one element is invisible behind another.
    const cells = new Map();
    for (const e of ELEMENTS) {
      const key = `${e.group}:${e.period}`;
      expect(cells.has(key), `${key} claimed by both ${cells.get(key)} and ${e.symbol}`).toBe(false);
      cells.set(key, e.symbol);
    }
  });

  it('should agree with the molar mass table on every shared element', () => {
    // Two sources of truth for atomic mass is exactly how a calculator starts
    // returning 58.44 for one compound and 58.45 for the next. The element
    // table must not contradict the table the arithmetic uses.
    for (const [sym, mass] of Object.entries(ATOMIC_WEIGHTS)) {
      const el = elementBySymbol(sym);
      expect(el, `${sym} should exist`).not.toBeNull();
      expect(el.mass, `${sym} mass must match ATOMIC_WEIGHTS`).toBeCloseTo(mass, 10);
    }
  });

  it('should produce a molar mass consistent with the element table', () => {
    // NaCl = 22.990 + 35.45 = 58.44
    expect(molarMass('NaCl')).toBeCloseTo(58.44, 2);
  });

  it('should record where each mass came from', () => {
    // 83 elements carry the IUPAC 2021 values the arithmetic already used; the
    // 35 the project never had (Tc, Pm, and everything past Bi) come from the
    // MIT-licensed data set. Marking the source keeps the provenance legible
    // instead of leaving two silently different tables in one file.
    const iupac = ELEMENTS.filter((e) => e.massSource === 'iupac');
    const library = ELEMENTS.filter((e) => e.massSource === 'library');
    expect(iupac.length + library.length).toBe(118);
    expect(library.length).toBeGreaterThan(0);
    for (const e of ELEMENTS) {
      expect(['iupac', 'library'], `${e.symbol} source`).toContain(e.massSource);
    }
  });
});

describe('elementBySymbol', () => {
  it('should find an element by its symbol', () => {
    expect(elementBySymbol('Na').name).toBe('Sodium');
    expect(elementBySymbol('Na').number).toBe(11);
  });

  it('should return null for an unknown symbol rather than throwing', () => {
    // Callers render a table from user input; a throw here would blank it.
    expect(elementBySymbol('Xx')).toBeNull();
    expect(elementBySymbol('')).toBeNull();
    expect(elementBySymbol(null)).toBeNull();
  });

  it('should be case sensitive, because Co and CO are different things', () => {
    expect(elementBySymbol('CO')).toBeNull();
  });
});

describe('gridPosition', () => {
  it('should give a 1-based column and row for a normal element', () => {
    expect(gridPosition('H')).toEqual({ col: 1, row: 1 });
    expect(gridPosition('He')).toEqual({ col: 18, row: 1 });
    expect(gridPosition('Na')).toEqual({ col: 1, row: 3 });
  });

  it('should return null for an unknown symbol', () => {
    expect(gridPosition('Xx')).toBeNull();
  });
});
