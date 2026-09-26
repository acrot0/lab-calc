import { describe, expect, it } from 'vitest';
import {
  R_GAS, arrhenius, concentrationAt, crossoverTemperature, degreeOfDissociation,
  equilibriumConstant, eutectic, fitOrder, gibbsEnergy, halfLife, kohlrausch,
  liquidusAt, molarConductivity, ostwaldDilutionLaw,
} from '../src/calc/physical.mjs';

/** Synthetic rate constants from a known Ea and A, so the fit can be checked. */
function arrheniusData({ tempsC, EaJ, A }) {
  return tempsC.map((tempC) => ({
    tempC,
    k: A * Math.exp(-EaJ / (R_GAS * (tempC + 273.15))),
  }));
}

describe('fitOrder', () => {
  it('should identify a first-order reaction and recover k', () => {
    const k = 0.02;
    const points = [0, 10, 20, 30, 40, 50].map((t) => ({ t, c: Math.exp(-k * t) }));
    const r = fitOrder(points);
    expect(r.order).toBe(1);
    expect(r.k).toBeCloseTo(k, 6);
    expect(r.r2).toBeCloseTo(1, 8);
  });

  it('should identify a zero-order reaction and recover k', () => {
    // c falls linearly from 1.0 at 0.05 per unit time.
    const points = [0, 2, 4, 6, 8, 10].map((t) => ({ t, c: 1 - 0.05 * t }));
    const r = fitOrder(points);
    expect(r.order).toBe(0);
    expect(r.k).toBeCloseTo(0.05, 8);
  });

  it('should identify a second-order reaction and recover k', () => {
    const k = 0.5;
    const points = [0, 1, 2, 3, 4, 5].map((t) => ({ t, c: 1 / (1 + k * t) }));
    const r = fitOrder(points);
    expect(r.order).toBe(2);
    expect(r.k).toBeCloseTo(k, 6);
  });

  it('should not choose first order for data that is clearly second order', () => {
    // The failure this guards: assuming first order because it is the common
    // case, and reporting a k that is wrong by a concentration factor.
    const points = [0, 1, 2, 3, 4, 5].map((t) => ({ t, c: 1 / (1 + 0.5 * t) }));
    expect(fitOrder(points).order).not.toBe(1);
  });

  it('should flag residuals that run in streaks', () => {
    // A first-order fit through second-order data leaves residuals that are
    // all one sign, which the transitions count detects where R² does not.
    const points = [0, 1, 2, 3, 4, 5, 6, 7].map((t) => ({ t, c: 1 / (1 + 0.8 * t) }));
    const r = fitOrder(points);
    // The chosen order should be the right one, so its own residuals scatter.
    expect(r.order).toBe(2);
    expect(r.residualPattern.curved).toBe(false);
  });

  it('should refuse fewer than three points', () => {
    expect(() => fitOrder([{ t: 0, c: 1 }, { t: 1, c: 0.9 }])).toThrow();
  });

  it('should refuse a non-positive concentration', () => {
    // log(0) and 1/0 are both undefined; catching it here beats returning NaN.
    expect(() => fitOrder([{ t: 0, c: 1 }, { t: 1, c: 0 }, { t: 2, c: 0.5 }])).toThrow();
  });
});

describe('concentrationAt', () => {
  it('should follow exponential decay for first order', () => {
    const r = concentrationAt({ order: 1, k: 0.1, initial: 2, time: 10 });
    expect(r.conc).toBeCloseTo(2 * Math.exp(-1), 10);
  });

  it('should follow linear decay for zero order', () => {
    expect(concentrationAt({ order: 0, k: 0.05, initial: 1, time: 10 }).conc).toBeCloseTo(0.5, 10);
  });

  it('should not go below zero for a zero-order reaction', () => {
    // The rate law stops applying once the reactant is gone. A negative
    // concentration is a number with no physical meaning.
    const r = concentrationAt({ order: 0, k: 0.5, initial: 1, time: 10 });
    expect(r.conc).toBe(0);
    expect(r.exhausted).toBe(true);
  });

  it('should follow the reciprocal law for second order', () => {
    const r = concentrationAt({ order: 2, k: 0.5, initial: 1, time: 2 });
    expect(r.conc).toBeCloseTo(1 / (1 + 1), 10);
  });

  it('should refuse an order it does not implement', () => {
    expect(() => concentrationAt({ order: 3, k: 1, initial: 1, time: 1 })).toThrow();
  });
});

describe('halfLife', () => {
  it('should give ln2/k for a first-order reaction', () => {
    expect(halfLife({ order: 1, k: 0.02, initial: 5 })).toBeCloseTo(Math.LN2 / 0.02, 10);
  });

  it('should not depend on the initial concentration for first order', () => {
    // The defining property of a first-order half-life, and the reason a
    // second-order formula cannot be substituted for it.
    const a = halfLife({ order: 1, k: 0.02, initial: 1 });
    const b = halfLife({ order: 1, k: 0.02, initial: 100 });
    expect(a).toBeCloseTo(b, 12);
  });

  it('should depend on the initial concentration for second order', () => {
    const a = halfLife({ order: 2, k: 0.5, initial: 1 });
    const b = halfLife({ order: 2, k: 0.5, initial: 2 });
    expect(b).toBeCloseTo(a / 2, 10);
  });

  it('should give [A]0/2k for zero order', () => {
    expect(halfLife({ order: 0, k: 0.05, initial: 1 })).toBeCloseTo(10, 10);
  });
});

describe('arrhenius', () => {
  it('should recover a known activation energy exactly from clean data', () => {
    // Synthetic data from Ea = 50 kJ/mol, so the fit has one right answer.
    const points = arrheniusData({ tempsC: [20, 30, 40, 50], EaJ: 50000, A: 1e10 });
    const r = arrhenius(points);
    expect(r.EaKJ).toBeCloseTo(50, 6);
    expect(r.A).toBeCloseTo(1e10, 2);
    expect(r.r2).toBeCloseTo(1, 8);
  });

  it('should recover a different activation energy from different data', () => {
    const points = arrheniusData({ tempsC: [20, 30, 40, 50], EaJ: 80000, A: 1e14 });
    expect(arrhenius(points).EaKJ).toBeCloseTo(80, 6);
  });

  it('should give a positive activation energy, not a negative one', () => {
    // The sign convention: ln k against 1/T has a negative slope and
    // Ea = -slope·R. Dropping the minus gives a negative Ea, which no ordinary
    // reaction has.
    const points = arrheniusData({ tempsC: [20, 30, 40, 50], EaJ: 50000, A: 1e10 });
    expect(arrhenius(points).EaKJ).toBeGreaterThan(0);
  });

  it('should widen the uncertainty as the temperature range narrows', () => {
    /*
     * The same scatter over a narrower range gives a much worse Ea. The data
     * below add a small perturbation so the residual scatter is comparable
     * between the two fits — otherwise both would be exact and the comparison
     * would say nothing.
     */
    const wide = arrheniusData({ tempsC: [10, 25, 40, 55], EaJ: 60000, A: 1e11 })
      .map((p, i) => ({ ...p, k: p.k * (1 + (i % 2 ? 0.02 : -0.02)) }));
    const narrow = arrheniusData({ tempsC: [20, 23, 26, 29], EaJ: 60000, A: 1e11 })
      .map((p, i) => ({ ...p, k: p.k * (1 + (i % 2 ? 0.02 : -0.02)) }));
    const w = arrhenius(wide);
    const n = arrhenius(narrow);
    expect(n.EaUncertaintyKJ).toBeGreaterThan(w.EaUncertaintyKJ * 2);
  });

  it('should flag a temperature range too narrow to trust', () => {
    const narrow = arrheniusData({ tempsC: [20, 23, 26, 29], EaJ: 60000, A: 1e11 });
    expect(arrhenius(narrow).rangeAdequate).toBe(false);
    const wide = arrheniusData({ tempsC: [10, 30, 50, 70], EaJ: 60000, A: 1e11 });
    expect(arrhenius(wide).rangeAdequate).toBe(true);
  });

  it('should report the temperature span it fitted over', () => {
    const r = arrhenius(arrheniusData({ tempsC: [15, 35, 55], EaJ: 50000, A: 1e10 }));
    expect(r.tempSpanC).toBeCloseTo(40, 10);
  });

  it('should refuse fewer than three points', () => {
    // Two points fit a line exactly and give an Ea with no uncertainty at all,
    // which is the most misleading possible answer.
    expect(() => arrhenius([
      { tempC: 20, k: 0.01 }, { tempC: 40, k: 0.05 },
    ])).toThrow();
  });

  it('should refuse a non-positive rate constant', () => {
    expect(() => arrhenius([
      { tempC: 20, k: 0.01 }, { tempC: 30, k: 0 }, { tempC: 40, k: 0.05 },
    ])).toThrow();
  });

  it('should refuse a temperature below absolute zero', () => {
    expect(() => arrhenius([
      { tempC: -300, k: 0.01 }, { tempC: 30, k: 0.02 }, { tempC: 40, k: 0.05 },
    ])).toThrow();
  });
});

describe('molarConductivity', () => {
  it('should convert mS/cm and mol/L into S·cm²/mol', () => {
    // 1.25 mS/cm at 0.001 mol/L: 1.25e-3 S/cm / 1e-3 mol/L = 1.25 S·cm²/mol
    // ... times the 1000 cm³/L gives 1250.
    const r = molarConductivity({ conductivityMsPerCm: 1.25, concMolPerL: 0.001 });
    expect(r.kappaSPerCm).toBeCloseTo(1.25e-3, 12);
    expect(r.lambda).toBeCloseTo(1250, 6);
  });

  it('should halve the molar conductivity when the concentration doubles', () => {
    // For the same measured conductivity, doubling c halves lambda.
    const a = molarConductivity({ conductivityMsPerCm: 2, concMolPerL: 0.001 });
    const b = molarConductivity({ conductivityMsPerCm: 2, concMolPerL: 0.002 });
    expect(b.lambda).toBeCloseTo(a.lambda / 2, 6);
  });

  it('should refuse a zero concentration', () => {
    expect(() => molarConductivity({ conductivityMsPerCm: 1, concMolPerL: 0 })).toThrow();
  });
});

describe('kohlrausch', () => {
  it('should extrapolate to the limiting molar conductivity', () => {
    // Synthetic data from lambda = 140 - 90*sqrt(c), so the intercept is 140.
    const points = [0.001, 0.002, 0.005, 0.01, 0.02].map((conc) => ({
      conc,
      lambda: 140 - 90 * Math.sqrt(conc),
    }));
    const r = kohlrausch(points);
    expect(r.limiting).toBeCloseTo(140, 6);
    expect(r.slope).toBeCloseTo(-90, 4);
    expect(r.r2).toBeCloseTo(1, 8);
  });

  it('should report a positive slope as implausible', () => {
    // Conductivity that rises without bound as concentration rises is not a
    // thing any electrolyte does.
    const points = [0.001, 0.002, 0.005].map((conc) => ({ conc, lambda: 100 + 50 * conc }));
    expect(kohlrausch(points).plausible).toBe(false);
  });

  it('should refuse fewer than three points', () => {
    expect(() => kohlrausch([{ conc: 0.001, lambda: 100 }, { conc: 0.01, lambda: 90 }])).toThrow();
  });
});

describe('degreeOfDissociation', () => {
  it('should give the ratio of measured to limiting conductivity', () => {
    expect(degreeOfDissociation({ lambda: 50, limiting: 200 }).alpha).toBeCloseTo(0.25, 10);
  });

  it('should report a percentage', () => {
    expect(degreeOfDissociation({ lambda: 50, limiting: 200 }).percent).toBeCloseTo(25, 10);
  });

  it('should flag an alpha above one as invalid rather than accept it', () => {
    // Above 1 the measurement contradicts the limiting value; one of them is
    // wrong, and silently returning 1.2 would hide that.
    const r = degreeOfDissociation({ lambda: 250, limiting: 200 });
    expect(r.valid).toBe(false);
  });
});

describe('ostwaldDilutionLaw', () => {
  it('should recover Ka from alpha and concentration', () => {
    // alpha = 0.1 at c = 0.01 gives Ka = 0.01 x 0.01 / 0.9 = 1.111e-4,
    // pKa 3.954.
    const r = ostwaldDilutionLaw({ alpha: 0.1, conc: 0.01 });
    expect(r.Ka).toBeCloseTo(0.01 * 0.01 / 0.9, 12);
    expect(r.pKa).toBeCloseTo(3.954, 3);
  });

  it('should give a smaller Ka for a weaker acid at the same concentration', () => {
    const strong = ostwaldDilutionLaw({ alpha: 0.2, conc: 0.01 });
    const weak = ostwaldDilutionLaw({ alpha: 0.02, conc: 0.01 });
    expect(weak.Ka).toBeLessThan(strong.Ka);
    expect(weak.pKa).toBeGreaterThan(strong.pKa);
  });

  it('should refuse an alpha of 1, where the formula divides by zero', () => {
    expect(() => ostwaldDilutionLaw({ alpha: 1, conc: 0.01 })).toThrow();
  });

  it('should refuse an alpha of zero', () => {
    expect(() => ostwaldDilutionLaw({ alpha: 0, conc: 0.01 })).toThrow();
  });
});

describe('gibbsEnergy', () => {
  it('should compute dG = dH - T·dS with the units reconciled', () => {
    // dH = 50 kJ/mol, dS = 100 J/(mol·K), T = 298.15 K: the entropy term is
    // 29.815 kJ/mol, so dG = 20.185 kJ/mol. Forgetting the 1000 gives a
    // nonsense answer of about 50 kJ/mol.
    const r = gibbsEnergy({ deltaH: 50, deltaS: 100, tempC: 25 });
    expect(r.entropyTermKJ).toBeCloseTo(29.815, 3);
    expect(r.deltaG).toBeCloseTo(20.185, 3);
  });

  it('should call a negative dG spontaneous', () => {
    const r = gibbsEnergy({ deltaH: -100, deltaS: 50, tempC: 25 });
    expect(r.deltaG).toBeLessThan(0);
    expect(r.spontaneous).toBe(true);
  });

  it('should call a positive dG non-spontaneous', () => {
    expect(gibbsEnergy({ deltaH: 50, deltaS: 100, tempC: 25 }).spontaneous).toBe(false);
  });

  it('should name enthalpy as the driver when dH dominates', () => {
    expect(gibbsEnergy({ deltaH: -200, deltaS: 10, tempC: 25 }).driving).toBe('enthalpy');
  });

  it('should name entropy as the driver when T·dS dominates', () => {
    expect(gibbsEnergy({ deltaH: 1, deltaS: 200, tempC: 25 }).driving).toBe('entropy');
  });

  it('should refuse a temperature below absolute zero', () => {
    expect(() => gibbsEnergy({ deltaH: 0, deltaS: 0, tempC: -300 })).toThrow();
  });
});

describe('crossoverTemperature', () => {
  it('should find the temperature where dG changes sign', () => {
    // dH = 50 kJ/mol, dS = 100 J/(mol·K): T = 50000/100 = 500 K = 226.85 C.
    const r = crossoverTemperature({ deltaH: 50, deltaS: 0.1 });
    expect(r.tempK).toBeCloseTo(500, 6);
    expect(r.tempC).toBeCloseTo(226.85, 2);
    expect(r.exists).toBe(true);
  });

  it('should say a crossover exists only when the signs match', () => {
    // Both positive: enthalpy opposes and entropy favours, so the balance tips
    // once and never again.
    expect(crossoverTemperature({ deltaH: 50, deltaS: 0.1 }).exists).toBe(true);
    expect(crossoverTemperature({ deltaH: -50, deltaS: -0.1 }).exists).toBe(true);
  });

  it('should report no crossover when the signs oppose', () => {
    // dH negative and dS negative both favour or both oppose at every
    // temperature; reporting a number would invent a transition.
    const r = crossoverTemperature({ deltaH: -50, deltaS: 0.1 });
    expect(r.exists).toBe(false);
    expect(r.direction).toBe('alwaysSame');
  });

  it('should name the direction of the crossover', () => {
    // Endothermic with positive entropy: spontaneous only above the crossover.
    expect(crossoverTemperature({ deltaH: 50, deltaS: 0.1 }).direction)
      .toBe('spontaneousAbove');
    // Exothermic with negative entropy: spontaneous only below it.
    expect(crossoverTemperature({ deltaH: -50, deltaS: -0.1 }).direction)
      .toBe('spontaneousBelow');
  });

  it('should refuse a zero entropy, where the formula divides by zero', () => {
    expect(() => crossoverTemperature({ deltaH: 50, deltaS: 0 })).toThrow();
  });
});

describe('equilibriumConstant', () => {
  it('should give K = 1 for a zero dG', () => {
    expect(equilibriumConstant({ deltaG: 0 }).K).toBeCloseTo(1, 12);
  });

  it('should give K greater than 1 for a spontaneous reaction', () => {
    expect(equilibriumConstant({ deltaG: -20 }).K).toBeGreaterThan(1);
  });

  it('should give K less than 1 for a non-spontaneous reaction', () => {
    expect(equilibriumConstant({ deltaG: 20 }).K).toBeLessThan(1);
  });

  it('should match the textbook value for a 20 kJ/mol dG at 25 C', () => {
    // dG = -20 kJ/mol gives ln K = 20000/(8.314462618 x 298.15) = 8.0675,
    // K = 3.19e3. The textbook rounds ln K to 8.067 and quotes K as 3.2e3.
    const r = equilibriumConstant({ deltaG: -20, tempC: 25 });
    expect(r.lnK).toBeCloseTo(8.0675, 3);
    expect(r.K).toBeCloseTo(3190, -1);
  });

  it('should give a pK consistent with the ln K', () => {
    const r = equilibriumConstant({ deltaG: -20, tempC: 25 });
    expect(r.pK).toBeCloseTo(-r.lnK / Math.LN10, 10);
  });
});

describe('eutectic', () => {
  // Naphthalene-benzene, the textbook ideal eutectic system.
  const naphthalene = { label: 'naphthalene', meltingC: 80.2, fusionKJ: 19.0 };
  const benzene = { label: 'benzene', meltingC: 5.5, fusionKJ: 9.87 };

  it('should find a eutectic between the two melting points', () => {
    const r = eutectic({ a: naphthalene, b: benzene });
    expect(r.exists).toBe(true);
    expect(r.eutecticTempC).toBeLessThan(5.5);
    expect(r.eutecticTempC).toBeGreaterThan(-60);
  });

  it('should place the eutectic nearer the lower-melting component', () => {
    // The eutectic of this system is near 20 mol% naphthalene, so the benzene
    // side dominates. A model that put it at 50% would be the ideal-solution
    // assumption being applied wrongly.
    const r = eutectic({ a: naphthalene, b: benzene });
    expect(r.xB).toBeGreaterThan(r.xA);
  });

  it('should give mole fractions that sum to one', () => {
    const r = eutectic({ a: naphthalene, b: benzene });
    expect(r.xA + r.xB).toBeCloseTo(1, 12);
  });

  it('should sample a curve for plotting', () => {
    const r = eutectic({ a: naphthalene, b: benzene });
    expect(r.curve.length).toBe(51);
    expect(r.curve[0].xA).toBe(0);
    expect(r.curve[50].xA).toBe(1);
  });

  it('should refuse a component missing its enthalpy of fusion', () => {
    expect(() => eutectic({
      a: { meltingC: 80 }, b: benzene,
    })).toThrow();
  });

  it('should refuse a component missing entirely', () => {
    expect(() => eutectic({ a: naphthalene })).toThrow();
  });
});

describe('liquidusAt', () => {
  const a = { label: 'A', meltingC: 80, fusionKJ: 20 };
  const b = { label: 'B', meltingC: 5, fusionKJ: 10 };

  it('should return the pure melting point at either end', () => {
    expect(liquidusAt({ a, b, xA: 1 }).tempK).toBeCloseTo(80 + 273.15, 6);
    expect(liquidusAt({ a, b, xA: 0 }).tempK).toBeCloseTo(5 + 273.15, 6);
  });

  it('should return the higher of the two depressed liquidus curves', () => {
    /*
     * The liquidus is the HIGHER of the two curves, not the lower: a liquid of
     * that composition freezes when the first component's solubility limit is
     * reached, which is the upper curve. At xA = 0.5 the two pure melting
     * points are 80 C and 5 C, so the answer sits between them, not below both.
     */
    const mid = liquidusAt({ a, b, xA: 0.5 });
    expect(mid.tempK).toBeLessThan(80 + 273.15);
    expect(mid.tempK).toBeGreaterThan(5 + 273.15);
    expect(mid.tempK).toBeCloseTo(Math.max(mid.fromA, mid.fromB), 10);
  });

  it('should depress each curve below its own pure melting point', () => {
    // The colligative effect: adding the other component lowers the freezing
    // point of each, which is what makes the eutectic lower than either.
    const mid = liquidusAt({ a, b, xA: 0.5 });
    expect(mid.fromA).toBeLessThan(80 + 273.15);
    expect(mid.fromB).toBeLessThan(5 + 273.15);
  });

  it('should name the component that crystallises first', () => {
    // On the A-rich side, A's liquidus is higher and A crystallises.
    expect(liquidusAt({ a, b, xA: 0.95 }).crystallising).toBe('A');
    expect(liquidusAt({ a, b, xA: 0.05 }).crystallising).toBe('B');
  });

  it('should refuse a mole fraction outside zero to one', () => {
    expect(() => liquidusAt({ a, b, xA: 1.5 })).toThrow();
    expect(() => liquidusAt({ a, b, xA: -0.1 })).toThrow();
  });
});
