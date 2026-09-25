import { describe, it, expect } from 'vitest';
import {
  ELEMENTS, elementBySymbol, ELEMENT_COUNT, gridPosition,
  categoryOf, ELEMENT_CATEGORIES, blockOf, periodOf, isFBlock,
} from '../src/calc/elements.mjs';
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

describe('categoryOf', () => {
  it('should classify the non-metal staircase by chemistry, not by column', () => {
    // These five are the regression. Deriving the category from group and
    // period files them as post-transition metals because they share groups
    // 14-16 with Sn, Pb and Bi. The staircase cuts diagonally across those
    // columns, so no positional rule can get them right.
    expect(categoryOf('C')).toBe('nonmetal');
    expect(categoryOf('N')).toBe('nonmetal');
    expect(categoryOf('O')).toBe('nonmetal');
    expect(categoryOf('P')).toBe('nonmetal');
    expect(categoryOf('S')).toBe('nonmetal');
  });

  it('should classify the metalloids straddling the staircase', () => {
    for (const s of ['B', 'Si', 'Ge', 'As', 'Sb', 'Te']) {
      expect(categoryOf(s), s).toBe('metalloid');
    }
  });

  it('should call astatine a metalloid even though it sits in group 17', () => {
    // Same trap as carbon: column 17 is mostly halogens, but astatine's
    // properties put it on the metalloid side of the line.
    expect(categoryOf('At')).toBe('metalloid');
    expect(categoryOf('I')).toBe('halogen');
  });

  it('should classify the main-group families', () => {
    expect(categoryOf('Li')).toBe('alkali');
    expect(categoryOf('Mg')).toBe('alkaline');
    expect(categoryOf('Fe')).toBe('transition');
    expect(categoryOf('Al')).toBe('postTransition');
    expect(categoryOf('Cl')).toBe('halogen');
    expect(categoryOf('He')).toBe('noble');
    expect(categoryOf('H')).toBe('nonmetal');
  });

  it('should place hydrogen as a non-metal despite sitting in group 1', () => {
    // Hydrogen is the classic exception: group 1 by electron count, non-metal
    // by behaviour.
    expect(categoryOf('H')).toBe('nonmetal');
    expect(categoryOf('Na')).toBe('alkali');
  });

  it('should classify the f-block by row, which is its definition', () => {
    expect(categoryOf('La')).toBe('lanthanide');
    expect(categoryOf('Lu')).toBe('lanthanide');
    expect(categoryOf('Ac')).toBe('actinide');
    expect(categoryOf('Lr')).toBe('actinide');
  });

  it('should accept an element object as well as a symbol', () => {
    expect(categoryOf(elementBySymbol('Fe'))).toBe('transition');
  });

  it('should give every one of the 118 elements a category', () => {
    for (const e of ELEMENTS) {
      expect(ELEMENT_CATEGORIES, `${e.symbol}`).toContain(categoryOf(e));
    }
  });

  it('should throw for an unassigned element rather than guessing', () => {
    // A plausible default is how the thirteen wrong labels shipped unnoticed.
    expect(() => categoryOf('Xx')).toThrow(/no category/);
    expect(() => categoryOf(null)).toThrow(/no category/);
  });

  it('should assign each element to exactly one category', () => {
    // The membership lists are hand-written, so a duplicate would silently
    // drop whichever came first.
    const counts = new Map();
    for (const e of ELEMENTS) {
      const c = categoryOf(e);
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(118);
    // Every category should have at least one member; an empty one would show
    // as a legend entry with nothing behind it.
    for (const c of ELEMENT_CATEGORIES) expect(counts.get(c), c).toBeGreaterThan(0);
  });
});

describe('blockOf', () => {
  it('should put the first two columns in the s-block', () => {
    expect(blockOf('Li')).toBe('s');
    expect(blockOf('Mg')).toBe('s');
    expect(blockOf('K')).toBe('s');
  });

  it('should call helium an s-block element despite its group', () => {
    // The one exception in the table: helium sits in group 18 with the p-block
    // gases, but its configuration is 1s², so it is an s-block element.
    expect(blockOf('He')).toBe('s');
    expect(blockOf('Ne')).toBe('p');
  });

  it('should put the middle columns in the d-block', () => {
    expect(blockOf('Fe')).toBe('d');
    expect(blockOf('Cu')).toBe('d');
    expect(blockOf('Zn')).toBe('d');
  });

  it('should put the right-hand columns in the p-block', () => {
    expect(blockOf('B')).toBe('p');
    expect(blockOf('C')).toBe('p');
    expect(blockOf('Cl')).toBe('p');
  });

  it('should put both detached rows in the f-block', () => {
    expect(blockOf('La')).toBe('f');
    expect(blockOf('Lu')).toBe('f');
    expect(blockOf('Ac')).toBe('f');
    expect(blockOf('Lr')).toBe('f');
  });

  it('should throw for an unknown element', () => {
    expect(() => blockOf('Xx')).toThrow(/unknown/);
  });
});

describe('periodOf', () => {
  it('should report the chemical period for a main-table element', () => {
    expect(periodOf('H')).toBe(1);
    expect(periodOf('Na')).toBe(3);
    expect(periodOf('Fe')).toBe(4);
    expect(periodOf('Rn')).toBe(6);
  });

  it('should report period 6 for every lanthanide, not the drawing row', () => {
    // The f-block is drawn on rows 9 and 10 so it can be detached below the
    // grid. Reporting the stored row would tell a reader that lanthanum sits
    // in period 9 — a period that does not exist.
    for (const s of ['La', 'Ce', 'Gd', 'Lu']) {
      expect(periodOf(s), s).toBe(6);
    }
  });

  it('should report period 7 for every actinide', () => {
    for (const s of ['Ac', 'U', 'Cm', 'Lr']) {
      expect(periodOf(s), s).toBe(7);
    }
  });

  it('should never report a period outside 1-7', () => {
    for (const e of ELEMENTS) {
      const p = periodOf(e);
      expect(p, `${e.symbol} period`).toBeGreaterThanOrEqual(1);
      expect(p, `${e.symbol} period`).toBeLessThanOrEqual(7);
    }
  });

  it('should throw for an unknown element', () => {
    expect(() => periodOf('Xx')).toThrow(/unknown/);
  });
});

describe('isFBlock', () => {
  it('should be true only for the two detached rows', () => {
    const f = ELEMENTS.filter((e) => isFBlock(e)).map((e) => e.symbol);
    expect(f).toHaveLength(30);
    expect(f).toContain('La');
    expect(f).toContain('U');
    expect(f).not.toContain('Hf');
    expect(f).not.toContain('Rf');
  });

  it('should agree with blockOf on which elements are f-block', () => {
    // Two ways of asking the same question must not disagree.
    for (const e of ELEMENTS) {
      expect(isFBlock(e), e.symbol).toBe(blockOf(e) === 'f');
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
