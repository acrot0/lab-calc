import { describe, it, expect } from 'vitest';
import {
  weakAcidPh,
  weakBasePh,
  equivalenceVolume,
  percentToMolarity,
  molarityToPercent,
  preparePercentSolution,
} from '../src/calc/titration.mjs';

/**
 * Reference values are textbook cases with published answers, not outputs of
 * this implementation. Where a real measured value differs from the ideal
 * formula, the tolerance reflects that — the weak-acid approximation is only
 * good to about two decimals at these concentrations.
 */

describe('weakAcidPh', () => {
  it('should give the textbook pH of 0.1 M acetic acid', () => {
    // pKa 4.76, C 0.1 M → pH = 0.5 × (4.76 + 1) = 2.88 (measured 2.87)
    expect(weakAcidPh({ pKa: 4.76, conc: 0.1 })).toBeCloseTo(2.88, 1);
  });

  it('should give a lower pH for a stronger acid at the same concentration', () => {
    // Smaller pKa = stronger acid = more H+ = lower pH
    const strong = weakAcidPh({ pKa: 3.0, conc: 0.1 });
    const weak = weakAcidPh({ pKa: 5.0, conc: 0.1 });
    expect(strong).toBeLessThan(weak);
  });

  it('should lower pH as concentration rises', () => {
    // 0.01 M → 0.5 × (4.76 + 2) = 3.38;  0.1 M → 2.88
    expect(weakAcidPh({ pKa: 4.76, conc: 0.01 })).toBeCloseTo(3.38, 1);
    expect(weakAcidPh({ pKa: 4.76, conc: 0.01 }))
      .toBeGreaterThan(weakAcidPh({ pKa: 4.76, conc: 0.1 }));
  });

  it('should reject a zero or negative concentration', () => {
    expect(() => weakAcidPh({ pKa: 4.76, conc: 0 })).toThrow();
    expect(() => weakAcidPh({ pKa: 4.76, conc: -1 })).toThrow();
  });
});

describe('weakBasePh', () => {
  it('should give the textbook pH of 0.1 M ammonia', () => {
    // pKb 4.75, C 0.1 → pOH = 0.5 × (4.75 + 1) = 2.875 → pH = 11.125
    expect(weakBasePh({ pKb: 4.75, conc: 0.1 })).toBeCloseTo(11.13, 1);
  });

  it('should give a pH above 7 for any weak base', () => {
    expect(weakBasePh({ pKb: 4.75, conc: 0.001 })).toBeGreaterThan(7);
  });

  it('should raise pH as concentration rises', () => {
    expect(weakBasePh({ pKb: 4.75, conc: 0.1 }))
      .toBeGreaterThan(weakBasePh({ pKb: 4.75, conc: 0.001 }));
  });

  it('should reject a zero or negative concentration', () => {
    expect(() => weakBasePh({ pKb: 4.75, conc: 0 })).toThrow();
  });
});

describe('equivalenceVolume', () => {
  it('should match volumes when concentrations are equal', () => {
    // 25 mL of 0.1 M HCl needs 25 mL of 0.1 M NaOH
    const r = equivalenceVolume({ analyteConc: 0.1, analyteVolumeMl: 25, titrantConc: 0.1 });
    expect(r.titrantVolumeMl).toBeCloseTo(25, 6);
  });

  it('should halve the volume when the titrant is twice as concentrated', () => {
    const r = equivalenceVolume({ analyteConc: 0.1, analyteVolumeMl: 25, titrantConc: 0.2 });
    expect(r.titrantVolumeMl).toBeCloseTo(12.5, 6);
  });

  it('should report the moles titrated', () => {
    const r = equivalenceVolume({ analyteConc: 0.1, analyteVolumeMl: 25, titrantConc: 0.1 });
    expect(r.molesAnalyte).toBeCloseTo(0.0025, 8);
  });

  it('should reject a zero titrant concentration rather than dividing by zero', () => {
    expect(() => equivalenceVolume({ analyteConc: 0.1, analyteVolumeMl: 25, titrantConc: 0 })).toThrow();
  });

  it('should reject non-positive analyte values', () => {
    expect(() => equivalenceVolume({ analyteConc: 0, analyteVolumeMl: 25, titrantConc: 0.1 })).toThrow();
    expect(() => equivalenceVolume({ analyteConc: 0.1, analyteVolumeMl: 0, titrantConc: 0.1 })).toThrow();
  });
});

describe('percentToMolarity', () => {
  it('should convert a 10% w/v NaCl solution', () => {
    // 10 g per 100 mL = 100 g/L ÷ 58.44 g/mol = 1.711 M
    expect(percentToMolarity({ percent: 10, formula: 'NaCl' })).toBeCloseTo(1.711, 2);
  });

  it('should convert a 0.9% saline solution to physiological molarity', () => {
    // Normal saline is 0.9% w/v NaCl ≈ 0.154 M
    expect(percentToMolarity({ percent: 0.9, formula: 'NaCl' })).toBeCloseTo(0.154, 2);
  });

  it('should reject a negative percentage', () => {
    expect(() => percentToMolarity({ percent: -1, formula: 'NaCl' })).toThrow();
  });

  it('should accept zero percent as valid', () => {
    expect(percentToMolarity({ percent: 0, formula: 'NaCl' })).toBe(0);
  });
});

describe('molarityToPercent', () => {
  it('should round-trip with percentToMolarity', () => {
    const pct = 10;
    const M = percentToMolarity({ percent: pct, formula: 'NaCl' });
    expect(molarityToPercent({ molarity: M, formula: 'NaCl' })).toBeCloseTo(pct, 6);
  });

  it('should report 0.9% for physiological saline', () => {
    expect(molarityToPercent({ molarity: 0.154, formula: 'NaCl' })).toBeCloseTo(0.9, 1);
  });
});

describe('preparePercentSolution', () => {
  it('should compute the mass for a w/v percentage', () => {
    // 250 mL of 10% w/v → 25 g
    const r = preparePercentSolution({ percent: 10, volumeMl: 250 });
    expect(r.massG).toBeCloseTo(25, 6);
  });

  it('should scale linearly with volume', () => {
    const a = preparePercentSolution({ percent: 5, volumeMl: 100 });
    const b = preparePercentSolution({ percent: 5, volumeMl: 200 });
    expect(b.massG).toBeCloseTo(a.massG * 2, 6);
  });

  it('should reject a non-positive volume', () => {
    expect(() => preparePercentSolution({ percent: 10, volumeMl: 0 })).toThrow();
  });

  it('should warn when a w/v percentage exceeds solubility for the given compound', () => {
    // 40% w/v NaCl is above its ~36 g/100 mL solubility at room temperature.
    // Flagging this is the difference between a calculator and a useful one.
    const r = preparePercentSolution({ percent: 40, volumeMl: 100, formula: 'NaCl' });
    expect(r.solubilityWarning).toBeTruthy();
  });

  it('should not warn for a comfortably soluble percentage', () => {
    const r = preparePercentSolution({ percent: 5, volumeMl: 100, formula: 'NaCl' });
    expect(r.solubilityWarning).toBeFalsy();
  });

  it('should not warn when no formula is given, since solubility is unknown', () => {
    expect(preparePercentSolution({ percent: 60, volumeMl: 100 }).solubilityWarning).toBeFalsy();
  });
});
