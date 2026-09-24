import { describe, it, expect } from 'vitest';
import {
  molarMass,
  parseFormula,
  massForMolarity,
  dilution,
  stockFromSolid,
  serializeRecord,
  summarizeRecord,
} from '../src/calc/solution.mjs';

/**
 * Reference values below were computed by hand from IUPAC 2021 atomic weights
 * and cross-checked against the textbook formula, not copied from a library.
 * If a number here is wrong the test is wrong — that is the point of writing
 * them out.
 */

describe('parseFormula', () => {
  it('should count a single element', () => {
    expect(parseFormula('Na')).toEqual([{ element: 'Na', count: 1 }]);
  });

  it('should read a subscript', () => {
    expect(parseFormula('H2O')).toEqual([
      { element: 'H', count: 2 },
      { element: 'O', count: 1 },
    ]);
  });

  it('should handle a parenthesised group with a multiplier', () => {
    // Ca(OH)2 — the 2 multiplies everything inside the parens
    expect(parseFormula('Ca(OH)2')).toEqual([
      { element: 'Ca', count: 1 },
      { element: 'O', count: 2 },
      { element: 'H', count: 2 },
    ]);
  });

  it('should handle nested groups', () => {
    // Al2(SO4)3
    expect(parseFormula('Al2(SO4)3')).toEqual([
      { element: 'Al', count: 2 },
      { element: 'S', count: 3 },
      { element: 'O', count: 12 },
    ]);
  });

  it('should handle a hydrate dot', () => {
    // CuSO4·5H2O — the leading 5 multiplies the water
    expect(parseFormula('CuSO4·5H2O')).toEqual([
      { element: 'Cu', count: 1 },
      { element: 'S', count: 1 },
      { element: 'O', count: 9 },
      { element: 'H', count: 10 },
    ]);
  });

  it('should reject an empty formula rather than returning zero', () => {
    expect(() => parseFormula('')).toThrow();
    expect(() => parseFormula('   ')).toThrow();
  });

  it('should reject an unknown element instead of silently ignoring it', () => {
    // A silent skip would produce a plausible-but-wrong molar mass — the worst
    // possible failure for a tool a chemist relies on.
    expect(() => parseFormula('Xx2O')).toThrow(
      expect.objectContaining({ code: 'unknownElement' }),
    );
  });

  it('should reject unbalanced parentheses rather than guessing', () => {
    expect(() => parseFormula('Ca(OH2')).toThrow();
  });

  it('should reject a formula starting with a digit', () => {
    expect(() => parseFormula('2H2O')).toThrow();
  });
});

describe('molarMass', () => {
  it('should compute water', () => {
    // H 1.008×2 + O 15.999 = 18.015
    expect(molarMass('H2O')).toBeCloseTo(18.015, 2);
  });

  it('should compute sodium chloride', () => {
    // Na 22.990 + Cl 35.45 = 58.44
    expect(molarMass('NaCl')).toBeCloseTo(58.44, 1);
  });

  it('should compute calcium hydroxide', () => {
    // Ca 40.078 + O 15.999×2 + H 1.008×2 = 74.092
    expect(molarMass('Ca(OH)2')).toBeCloseTo(74.09, 1);
  });

  it('should compute aluminium sulfate', () => {
    // Al 26.982×2 + S 32.06×3 + O 15.999×12 = 342.15
    expect(molarMass('Al2(SO4)3')).toBeCloseTo(342.15, 1);
  });

  it('should compute copper sulfate pentahydrate', () => {
    // CuSO4 = 63.546 + 32.06 + 15.999×4 = 159.60
    // 5H2O  = 5 × 18.015           =  90.08
    // total                          = 249.68
    expect(molarMass('CuSO4·5H2O')).toBeCloseTo(249.68, 1);
  });

  it('should compute glucose', () => {
    // C6H12O6 = 180.156
    expect(molarMass('C6H12O6')).toBeCloseTo(180.16, 1);
  });
});

describe('massForMolarity', () => {
  it('should compute the mass to weigh out for a 1 M, 1 L solution of NaOH', () => {
    // 1 mol/L × 1 L × 39.997 g/mol = 39.997 g
    const r = massForMolarity({ formula: 'NaOH', molarity: 1, volumeMl: 1000 });
    expect(r.massG).toBeCloseTo(39.997, 2);
    expect(r.molarMass).toBeCloseTo(39.997, 2);
  });

  it('should scale with volume', () => {
    // 250 mL is a quarter of the mass of 1 L
    const full = massForMolarity({ formula: 'NaOH', molarity: 1, volumeMl: 1000 });
    const quarter = massForMolarity({ formula: 'NaOH', molarity: 1, volumeMl: 250 });
    expect(quarter.massG).toBeCloseTo(full.massG / 4, 3);
  });

  it('should scale with molarity', () => {
    const one = massForMolarity({ formula: 'NaCl', molarity: 1, volumeMl: 500 });
    const half = massForMolarity({ formula: 'NaCl', molarity: 0.5, volumeMl: 500 });
    expect(half.massG).toBeCloseTo(one.massG / 2, 3);
  });

  it('should reject a negative or zero volume', () => {
    expect(() => massForMolarity({ formula: 'NaCl', molarity: 1, volumeMl: 0 })).toThrow();
    expect(() => massForMolarity({ formula: 'NaCl', molarity: 1, volumeMl: -5 })).toThrow();
  });

  it('should reject a negative molarity', () => {
    expect(() => massForMolarity({ formula: 'NaCl', molarity: -1, volumeMl: 100 })).toThrow();
  });

  it('should accept zero molarity as a valid (if pointless) input', () => {
    // 0 M means 0 g. That is correct arithmetic, not an error.
    expect(massForMolarity({ formula: 'NaCl', molarity: 0, volumeMl: 100 }).massG).toBe(0);
  });
});

describe('dilution', () => {
  it('should solve for the volume of stock needed (C1V1 = C2V2)', () => {
    // Want 100 mL of 0.1 M from a 1 M stock → 10 mL
    const r = dilution({ stockConc: 1, targetConc: 0.1, targetVolumeMl: 100 });
    expect(r.stockVolumeMl).toBeCloseTo(10, 6);
    expect(r.diluentVolumeMl).toBeCloseTo(90, 6);
  });

  it('should report the diluent to add, not just the stock', () => {
    const r = dilution({ stockConc: 2, targetConc: 0.5, targetVolumeMl: 200 });
    expect(r.stockVolumeMl).toBeCloseTo(50, 6);
    expect(r.diluentVolumeMl).toBeCloseTo(150, 6);
  });

  it('should reject a target more concentrated than the stock', () => {
    // You cannot dilute up. Silently returning a number here would have the
    // user pipette something impossible.
    expect(() => dilution({ stockConc: 0.1, targetConc: 1, targetVolumeMl: 100 }))
      .toThrow(expect.objectContaining({ code: 'diluteUp' }));
  });

  it('should reject a zero or negative stock concentration', () => {
    expect(() => dilution({ stockConc: 0, targetConc: 0.1, targetVolumeMl: 100 })).toThrow();
    expect(() => dilution({ stockConc: -1, targetConc: 0.1, targetVolumeMl: 100 })).toThrow();
  });

  it('should allow diluting to the same concentration, yielding zero diluent', () => {
    const r = dilution({ stockConc: 1, targetConc: 1, targetVolumeMl: 100 });
    expect(r.stockVolumeMl).toBeCloseTo(100, 6);
    expect(r.diluentVolumeMl).toBeCloseTo(0, 6);
  });
});

describe('stockFromSolid', () => {
  it('should give both the mass and the final volume for a stock solution', () => {
    // 500 mL of 0.5 M NaCl: 0.25 mol × 58.44 = 14.61 g
    const r = stockFromSolid({ formula: 'NaCl', molarity: 0.5, volumeMl: 500 });
    expect(r.massG).toBeCloseTo(14.61, 1);
    expect(r.finalVolumeMl).toBe(500);
  });

  it('should carry the molar mass through for display', () => {
    expect(stockFromSolid({ formula: 'NaOH', molarity: 1, volumeMl: 1000 }).molarMass).toBeCloseTo(39.997, 2);
  });
});

describe('serializeRecord', () => {
  const rec = {
    kind: 'massForMolarity',
    inputs: { formula: 'NaCl', molarity: 0.5, volumeMl: 500 },
    outputs: { massG: 14.61, molarMass: 58.44 },
  };

  it('should round-trip through JSON', () => {
    const parsed = JSON.parse(serializeRecord(rec));
    expect(parsed).toMatchObject(rec);
  });

  it('should attach a timestamp so a history list can be ordered', () => {
    const parsed = JSON.parse(serializeRecord(rec, new Date('2026-09-24T10:00:00Z')));
    expect(parsed.at).toBe('2026-09-24T10:00:00.000Z');
  });

  it('should keep every field of the original record', () => {
    const parsed = JSON.parse(serializeRecord(rec, new Date('2026-09-24T10:00:00Z')));
    expect(parsed.kind).toBe(rec.kind);
    expect(parsed.inputs).toEqual(rec.inputs);
    expect(parsed.outputs).toEqual(rec.outputs);
  });

  it('should not mutate the record it is given', () => {
    const original = { ...rec };
    serializeRecord(rec, new Date('2026-09-24T10:00:00Z'));
    expect(rec).toEqual(original);
  });
});

describe('summarizeRecord', () => {
  it('should render a one-line human summary for the history list', () => {
    const s = summarizeRecord({
      kind: 'massForMolarity',
      inputs: { formula: 'NaCl', molarity: 0.5, volumeMl: 500 },
      outputs: { massG: 14.61, molarMass: 58.44 },
    });
    expect(s).toContain('NaCl');
    expect(s).toContain('14.6');
  });

  it('should label a dilution with both volumes', () => {
    const s = summarizeRecord({
      kind: 'dilution',
      inputs: { stockConc: 1, targetConc: 0.1, targetVolumeMl: 100 },
      outputs: { stockVolumeMl: 10, diluentVolumeMl: 90 },
    });
    expect(s).toContain('10');
    expect(s).toContain('90');
  });

  it('should not throw on an unknown record kind', () => {
    expect(() => summarizeRecord({ kind: 'mystery', inputs: {}, outputs: {} })).not.toThrow();
  });
});
