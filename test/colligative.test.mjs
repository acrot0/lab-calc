import { describe, it, expect } from 'vitest';
import {
  SOLVENTS,
  DILUTE_LIMIT,
  R_GAS,
  colligative,
  osmoticPressure,
  molarMassFromFreezingPoint,
} from '../src/calc/colligative.mjs';

/**
 * Reference values are hand-computed from the constants in the tables, which
 * are the standard cryoscopic and ebullioscopic values for each solvent.
 */

describe('colligative', () => {
  it('should raise the boiling point of water by i·Kb·m', () => {
    // 0.5 m glucose, i = 1: ΔTb = 0.512 × 0.5 = 0.256 K
    const r = colligative({ solvent: 'water', molality: 0.5 });
    expect(r.deltaTb).toBeCloseTo(0.256, 6);
    expect(r.boilingPoint).toBeCloseTo(100.256, 6);
  });

  it('should depress the freezing point of water by i·Kf·m', () => {
    // 0.5 m glucose: ΔTf = 1.86 × 0.5 = 0.93 K
    const r = colligative({ solvent: 'water', molality: 0.5 });
    expect(r.deltaTf).toBeCloseTo(0.93, 6);
    expect(r.freezingPoint).toBeCloseTo(-0.93, 6);
  });

  it('should count both ions of a 1:1 salt', () => {
    // 0.5 m NaCl, i = 2: ΔTf = 2 × 1.86 × 0.5 = 1.86 K
    const r = colligative({ solvent: 'water', molality: 0.5, i: 2 });
    expect(r.deltaTf).toBeCloseTo(1.86, 6);
    expect(r.freezingPoint).toBeCloseTo(-1.86, 6);
  });

  it('should use the solvent own constants, not water', () => {
    // Benzene: Kf 5.12, fp 5.5 °C. 0.1 m → ΔTf = 0.512 K, fp = 4.988 °C
    const r = colligative({ solvent: 'benzene', molality: 0.1 });
    expect(r.deltaTf).toBeCloseTo(0.512, 6);
    expect(r.freezingPoint).toBeCloseTo(4.988, 6);
  });

  it('should raise the boiling point above the solvent normal boiling point', () => {
    // Acetic acid boils at 118.1 °C; 0.2 m → +3.07 × 0.2 = +0.614 K
    const r = colligative({ solvent: 'aceticAcid', molality: 0.2 });
    expect(r.boilingPoint).toBeCloseTo(118.714, 3);
  });

  it('should return the solvent constants it used', () => {
    const r = colligative({ solvent: 'water', molality: 0.1 });
    expect(r.kb).toBe(SOLVENTS.water.kb);
    expect(r.kf).toBe(SOLVENTS.water.kf);
  });

  it('should accept a zero molality as a no-op', () => {
    const r = colligative({ solvent: 'water', molality: 0 });
    expect(r.deltaTb).toBe(0);
    expect(r.freezingPoint).toBe(0);
  });

  it('should flag a concentration past the dilute limit', () => {
    // The colligative laws assume an ideal dilute solution; at 2 mol/kg the
    // answer is still computed but is no longer trustworthy.
    const r = colligative({ solvent: 'water', molality: DILUTE_LIMIT + 1 });
    expect(r.diluteWarning?.code).toBe('tooConcentrated');
  });

  it('should not flag a concentration inside the dilute limit', () => {
    expect(colligative({ solvent: 'water', molality: 0.2 }).diluteWarning).toBe(null);
  });

  it('should reject an unknown solvent', () => {
    expect(() => colligative({ solvent: 'mercury', molality: 0.1 })).toThrow();
  });

  it('should reject a negative molality', () => {
    expect(() => colligative({ solvent: 'water', molality: -1 })).toThrow();
  });

  it('should reject a non-positive van t Hoff factor', () => {
    expect(() => colligative({ solvent: 'water', molality: 0.1, i: 0 })).toThrow();
  });
});

describe('osmoticPressure', () => {
  it('should give the pressure of a physiological saline', () => {
    // 0.15 M NaCl, i = 2, 25 °C: π = 2 × 0.15 × 0.082057 × 298.15 = 7.34 atm
    const r = osmoticPressure({ molarity: 0.15, i: 2 });
    expect(r.atm).toBeCloseTo(7.34, 1);
  });

  it('should report the same pressure in kPa', () => {
    const r = osmoticPressure({ molarity: 0.15, i: 2 });
    expect(r.kPa).toBeCloseTo(r.atm * 101.325, 6);
  });

  it('should convert the temperature to kelvin', () => {
    expect(osmoticPressure({ molarity: 0.1, tempC: 37 }).tempK).toBeCloseTo(310.15, 6);
  });

  it('should default to 25 °C', () => {
    expect(osmoticPressure({ molarity: 0.1 }).tempK).toBeCloseTo(298.15, 6);
  });

  it('should scale linearly with concentration', () => {
    const a = osmoticPressure({ molarity: 0.1 });
    const b = osmoticPressure({ molarity: 0.2 });
    expect(b.atm).toBeCloseTo(a.atm * 2, 9);
  });

  it('should agree with the gas constant it exports', () => {
    // π = iMRT with R = 0.082057 L·atm·mol⁻¹·K⁻¹
    expect(osmoticPressure({ molarity: 1, tempC: 0 }).atm).toBeCloseTo(R_GAS * 273.15, 9);
  });

  it('should reject a negative concentration', () => {
    expect(() => osmoticPressure({ molarity: -1 })).toThrow();
  });

  it('should reject a non-finite temperature', () => {
    expect(() => osmoticPressure({ molarity: 0.1, tempC: NaN })).toThrow();
  });
});

describe('molarMassFromFreezingPoint', () => {
  it('should recover the molar mass of an unknown from its freezing point drop', () => {
    // 1.00 g in 20.0 g benzene, ΔTf = 1.28 K, Kf 5.12:
    // m = 1.28/5.12 = 0.25 mol/kg; n = 0.25 × 0.020 = 0.005 mol; M = 200 g/mol
    const r = molarMassFromFreezingPoint({
      solvent: 'benzene', deltaTf: 1.28, massG: 1.0, solventKg: 0.02,
    });
    expect(r.molality).toBeCloseTo(0.25, 6);
    expect(r.moles).toBeCloseTo(0.005, 9);
    expect(r.molarMass).toBeCloseTo(200, 6);
  });

  it('should double the apparent molar mass when the van t Hoff factor doubles', () => {
    // A fixed ΔTf with i = 2 means half as many dissolved particles, hence half
    // the moles for the same mass — so the molar mass this method reports
    // doubles. That is the classic failure of the method on a salt: forgetting
    // `i` does not give a wrong-format answer, it gives half the true value.
    const base = { solvent: 'benzene', deltaTf: 1.28, massG: 1.0, solventKg: 0.02 };
    const one = molarMassFromFreezingPoint({ ...base, i: 1 });
    const two = molarMassFromFreezingPoint({ ...base, i: 2 });
    expect(two.molarMass).toBeCloseTo(one.molarMass * 2, 6);
  });

  it('should use the cryoscopic constant of the named solvent', () => {
    // Water Kf 1.86: m = 1.28/1.86 = 0.688 mol/kg
    const r = molarMassFromFreezingPoint({
      solvent: 'water', deltaTf: 1.28, massG: 1.0, solventKg: 0.02,
    });
    expect(r.molality).toBeCloseTo(1.28 / 1.86, 6);
  });

  it('should reject a zero freezing point drop', () => {
    expect(() => molarMassFromFreezingPoint({
      solvent: 'benzene', deltaTf: 0, massG: 1.0, solventKg: 0.02,
    })).toThrow();
  });

  it('should reject an unknown solvent', () => {
    expect(() => molarMassFromFreezingPoint({
      solvent: 'mercury', deltaTf: 1, massG: 1.0, solventKg: 0.02,
    })).toThrow();
  });

  it('should reject a zero solvent mass rather than dividing by zero', () => {
    expect(() => molarMassFromFreezingPoint({
      solvent: 'benzene', deltaTf: 1, massG: 1.0, solventKg: 0,
    })).toThrow();
  });
});
