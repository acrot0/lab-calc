import { describe, it, expect } from 'vitest';
import {
  molarityFromPercent,
  volumeForMolarity,
  normality,
  equivalentWeight,
  molality,
  moleFraction,
  activityCoefficient,
  ionicStrength,
  beerLambert,
  standardCurve,
  predictFromCurve,
} from '../src/calc/reagent.mjs';

/**
 * Reference values are hand-computed from the chemistry, using published
 * reagent data (concentrated HCl is 37% w/w, ρ 1.19 g/mL; concentrated H2SO4 is
 * 98%, ρ 1.84; ammonia is 28%, ρ 0.90).
 */

describe('molarityFromPercent', () => {
  it('should give the molarity of concentrated hydrochloric acid', () => {
    // 37% w/w, ρ 1.19 g/mL, M 36.46
    // 1000 mL × 1.19 g/mL × 0.37 = 440.3 g/L ÷ 36.46 = 12.08 M
    const r = molarityFromPercent({ percent: 37, density: 1.19, formula: 'HCl' });
    expect(r.molarity).toBeCloseTo(12.08, 1);
  });

  it('should give the molarity of concentrated sulfuric acid', () => {
    // 98% w/w, ρ 1.84, M 98.08 → 1000×1.84×0.98/98.08 = 18.4 M
    expect(molarityFromPercent({ percent: 98, density: 1.84, formula: 'H2SO4' }).molarity)
      .toBeCloseTo(18.4, 1);
  });

  it('should give the molarity of concentrated ammonia', () => {
    // 28% w/w, ρ 0.90, M 17.03 → 1000×0.90×0.28/17.03 = 14.8 M
    expect(molarityFromPercent({ percent: 28, density: 0.90, formula: 'NH3' }).molarity)
      .toBeCloseTo(14.8, 1);
  });

  it('should report the grams per litre it derived', () => {
    expect(molarityFromPercent({ percent: 37, density: 1.19, formula: 'HCl' }).gramsPerL)
      .toBeCloseTo(440.3, 1);
  });

  it('should reject a percentage above 100', () => {
    expect(() => molarityFromPercent({ percent: 120, density: 1.19, formula: 'HCl' })).toThrow();
  });

  it('should reject a non-positive density rather than dividing by zero', () => {
    expect(() => molarityFromPercent({ percent: 37, density: 0, formula: 'HCl' })).toThrow();
  });
});

describe('volumeForMolarity', () => {
  it('should compute how much concentrated HCl makes 1 L of 1 M', () => {
    // 1 mol ÷ 12.08 M = 82.8 mL
    const r = volumeForMolarity({ percent: 37, density: 1.19, formula: 'HCl', targetMolarity: 1, targetVolumeMl: 1000 });
    expect(r.volumeMl).toBeCloseTo(82.8, 1);
    expect(r.stockMolarity).toBeCloseTo(12.08, 1);
  });

  it('should scale with the target volume', () => {
    const a = volumeForMolarity({ percent: 37, density: 1.19, formula: 'HCl', targetMolarity: 1, targetVolumeMl: 500 });
    const b = volumeForMolarity({ percent: 37, density: 1.19, formula: 'HCl', targetMolarity: 1, targetVolumeMl: 1000 });
    expect(b.volumeMl).toBeCloseTo(a.volumeMl * 2, 3);
  });

  it('should warn when the stock is weaker than the target', () => {
    // Cannot reach 15 M from a 12 M stock.
    expect(() => volumeForMolarity({ percent: 37, density: 1.19, formula: 'HCl', targetMolarity: 15, targetVolumeMl: 100 }))
      .toThrow(expect.objectContaining({ code: 'diluteUp' }));
  });
});

describe('equivalentWeight', () => {
  it('should equal the molar mass for a monoprotic acid', () => {
    expect(equivalentWeight({ formula: 'HCl', n: 1 })).toBeCloseTo(36.46, 1);
  });

  it('should halve the molar mass for a diprotic acid', () => {
    // H2SO4: 98.08 / 2 = 49.04
    expect(equivalentWeight({ formula: 'H2SO4', n: 2 })).toBeCloseTo(49.04, 1);
  });

  it('should third the molar mass for a triprotic acid', () => {
    // H3PO4: 97.99 / 3 = 32.66
    expect(equivalentWeight({ formula: 'H3PO4', n: 3 })).toBeCloseTo(32.66, 1);
  });

  it('should reject a non-positive equivalent count', () => {
    expect(() => equivalentWeight({ formula: 'HCl', n: 0 })).toThrow();
  });
});

describe('normality', () => {
  it('should equal molarity for a monoprotic acid', () => {
    expect(normality({ molarity: 1, n: 1 })).toBeCloseTo(1, 6);
  });

  it('should double molarity for a diprotic acid', () => {
    expect(normality({ molarity: 0.5, n: 2 })).toBeCloseTo(1, 6);
  });

  it('should reject a non-positive equivalent count', () => {
    expect(() => normality({ molarity: 1, n: 0 })).toThrow();
  });
});

describe('molality and mole fraction', () => {
  it('should compute molality from moles of solute and kg of solvent', () => {
    // 0.5 mol in 0.5 kg water = 1 mol/kg
    expect(molality({ molesSolute: 0.5, solventKg: 0.5 })).toBeCloseTo(1, 6);
  });

  it('should reject a zero solvent mass rather than dividing by zero', () => {
    expect(() => molality({ molesSolute: 0.5, solventKg: 0 })).toThrow();
  });

  it('should compute a mole fraction', () => {
    // 1 mol solute in 9 mol solvent → 0.1
    expect(moleFraction({ molesSolute: 1, molesSolvent: 9 })).toBeCloseTo(0.1, 6);
  });

  it('should give a mole fraction of 1 for a pure solute', () => {
    expect(moleFraction({ molesSolute: 1, molesSolvent: 0 })).toBeCloseTo(1, 6);
  });

  it('should reject a zero total rather than returning NaN', () => {
    expect(() => moleFraction({ molesSolute: 0, molesSolvent: 0 })).toThrow();
  });
});

describe('ionicStrength', () => {
  it('should compute the ionic strength of a 1:1 salt', () => {
    // 0.1 M NaCl: ½(0.1×1² + 0.1×1²) = 0.1
    expect(ionicStrength([{ conc: 0.1, charge: 1 }, { conc: 0.1, charge: -1 }])).toBeCloseTo(0.1, 6);
  });

  it('should weight by charge squared, so a 2:1 salt gives more', () => {
    // 0.1 M CaCl2: ½(0.1×4 + 0.2×1) = 0.3
    expect(ionicStrength([{ conc: 0.1, charge: 2 }, { conc: 0.2, charge: -1 }])).toBeCloseTo(0.3, 6);
  });

  it('should be zero for a non-electrolyte', () => {
    expect(ionicStrength([])).toBe(0);
  });

  it('should reject a malformed ion entry', () => {
    expect(() => ionicStrength([{ conc: -1, charge: 1 }])).toThrow();
  });
});

describe('activityCoefficient', () => {
  it('should be 1 in an infinitely dilute solution', () => {
    // Debye–Hückel reduces to γ = 1 as I → 0
    expect(activityCoefficient({ ionicStrength: 0, charge: 1 })).toBeCloseTo(1, 3);
  });

  it('should be below 1 at finite ionic strength', () => {
    // The whole point: real solutions are less ideal than the model assumes.
    const g = activityCoefficient({ ionicStrength: 0.1, charge: 1 });
    expect(g).toBeLessThan(1);
    expect(g).toBeGreaterThan(0.7);
  });

  it('should give a smaller coefficient for a divalent ion at the same strength', () => {
    const mono = activityCoefficient({ ionicStrength: 0.05, charge: 1 });
    const di = activityCoefficient({ ionicStrength: 0.05, charge: 2 });
    expect(di).toBeLessThan(mono);
  });

  it('should match the textbook value for a 1:1 electrolyte at I = 0.1', () => {
    // Davies: −0.51·1·(√0.1/(1+√0.1) − 0.3·0.1) = −0.1072 → γ = 0.781
    expect(activityCoefficient({ ionicStrength: 0.1, charge: 1 })).toBeCloseTo(0.78, 1);
  });

  it('should stay valid at physiological ionic strength', () => {
    // I ≈ 0.15 M is ordinary cell medium — below the extended Debye–Hückel
    // range, which is why Davies was chosen. γ should be a believable ~0.75.
    const g = activityCoefficient({ ionicStrength: 0.15, charge: 1 });
    expect(g).toBeGreaterThan(0.7);
    expect(g).toBeLessThan(0.8);
  });

  it('should approach 1 as the solution becomes infinitely dilute', () => {
    // Davies keeps a √I term, so convergence to 1 is asymptotic rather than
    // exact — 1e-8 M still sits 1.2e-4 below unity, which is the correct
    // behaviour, not an error.
    const g = activityCoefficient({ ionicStrength: 1e-8, charge: 1 });
    expect(g).toBeGreaterThan(0.999);
    expect(g).toBeLessThanOrEqual(1);
  });

  it('should be exactly 1 at zero ionic strength', () => {
    // The one point where the model must not introduce a residual.
    expect(activityCoefficient({ ionicStrength: 0, charge: 1 })).toBe(1);
  });

  it('should reject a negative ionic strength', () => {
    expect(() => activityCoefficient({ ionicStrength: -1, charge: 1 })).toThrow();
  });

  it('should reject a non-integer charge', () => {
    expect(() => activityCoefficient({ ionicStrength: 0.1, charge: 1.5 })).toThrow();
  });
});

describe('beerLambert', () => {
  it('should compute absorbance from concentration and path length', () => {
    // A = ε·c·l = 15000 × 5e-5 × 1 = 0.75
    expect(beerLambert({ epsilon: 15000, conc: 5e-5, pathCm: 1 }).absorbance).toBeCloseTo(0.75, 6);
  });

  it('should solve for concentration when given absorbance', () => {
    const r = beerLambert({ epsilon: 15000, absorbance: 0.75, pathCm: 1 });
    expect(r.conc).toBeCloseTo(5e-5, 10);
  });

  it('should scale linearly with path length', () => {
    const a = beerLambert({ epsilon: 15000, conc: 5e-5, pathCm: 1 }).absorbance;
    const b = beerLambert({ epsilon: 15000, conc: 5e-5, pathCm: 2 }).absorbance;
    expect(b).toBeCloseTo(a * 2, 6);
  });

  it('should flag absorbance outside the linear range', () => {
    // Above ~1.5 the relationship stops being linear in practice, and a
    // concentration read from it is unreliable — worth saying.
    const r = beerLambert({ epsilon: 50000, conc: 1e-4, pathCm: 1 });
    expect(r.absorbance).toBeGreaterThan(1.5);
    expect(r.linearityWarning).toBeTruthy();
  });

  it('should not warn inside the linear range', () => {
    expect(beerLambert({ epsilon: 15000, conc: 5e-5, pathCm: 1 }).linearityWarning).toBeFalsy();
  });

  it('should reject a non-positive extinction coefficient', () => {
    expect(() => beerLambert({ epsilon: 0, conc: 1e-4, pathCm: 1 })).toThrow();
  });
});

describe('standardCurve', () => {
  // A clean line: y = 0.5x + 0.02
  const pts = [
    { x: 0, y: 0.02 }, { x: 1, y: 0.52 }, { x: 2, y: 1.02 }, { x: 3, y: 1.52 }, { x: 4, y: 2.02 },
  ];

  it('should recover the slope and intercept of a clean line', () => {
    const f = standardCurve(pts);
    expect(f.slope).toBeCloseTo(0.5, 6);
    expect(f.intercept).toBeCloseTo(0.02, 6);
  });

  it('should report an R² of 1 for a perfect line', () => {
    expect(standardCurve(pts).r2).toBeCloseTo(1, 6);
  });

  it('should report a lower R² for scattered points', () => {
    const noisy = [...pts.slice(0, 4), { x: 4, y: 1.4 }];
    expect(standardCurve(noisy).r2).toBeLessThan(0.99);
  });

  it('should require at least three points to be meaningful', () => {
    expect(() => standardCurve([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toThrow();
  });

  it('should reject points that do not vary in x', () => {
    expect(() => standardCurve([{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }])).toThrow();
  });
});

describe('predictFromCurve', () => {
  it('should invert the fit to give a concentration', () => {
    const f = standardCurve([
      { x: 0, y: 0.02 }, { x: 1, y: 0.52 }, { x: 2, y: 1.02 }, { x: 3, y: 1.52 },
    ]);
    expect(predictFromCurve(f, 1.02).value).toBeCloseTo(2, 4);
  });

  it('should warn when the reading sits outside the calibrated range', () => {
    // Extrapolating past the standards is a common and quiet source of error.
    const f = standardCurve([
      { x: 0, y: 0.02 }, { x: 1, y: 0.52 }, { x: 2, y: 1.02 }, { x: 3, y: 1.52 },
    ]);
    const r = predictFromCurve(f, 5.0);
    expect(r.value).toBeGreaterThan(3);
    expect(r.outOfRange).toBe(true);
  });

  it('should not flag a reading inside the range', () => {
    const f = standardCurve([
      { x: 0, y: 0.02 }, { x: 1, y: 0.52 }, { x: 2, y: 1.02 }, { x: 3, y: 1.52 },
    ]);
    expect(predictFromCurve(f, 1.02).outOfRange).toBe(false);
  });
});
