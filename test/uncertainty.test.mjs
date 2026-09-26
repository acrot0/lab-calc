import { describe, expect, it } from 'vitest';
import {
  ATOMIC_WEIGHT_UNCERTAINTY, molarMassUncertainty, productUncertainty, quantity,
  relativeUncertainty, roundPair, roundToSignificant, significantFigures,
  effectiveDegreesOfFreedom, sumUncertainty, uncertaintyFigures,
} from '../src/calc/uncertainty.mjs';

/*
 * The reference values here are hand calculations from the defining equations,
 * not outputs of the module. A test that only checked the module against itself
 * would pass on a version that added uncertainties straight instead of in
 * quadrature, which is the single error this module exists to prevent.
 */

describe('quantity', () => {
  it('should carry a value and its uncertainty together', () => {
    expect(quantity(5.844, 0.001)).toEqual({ value: 5.844, unc: 0.001 });
  });

  it('should treat a bare value as exact', () => {
    expect(quantity(1000)).toEqual({ value: 1000, unc: 0 });
  });

  it('should reject a negative uncertainty', () => {
    expect(() => quantity(1, -0.1)).toThrow();
  });
});

describe('relativeUncertainty', () => {
  it('should express a balance reading as a fraction', () => {
    // 5.844 ± 0.001 g is 0.0171% — the figure that decides whether the balance
    // or the molar mass limits the experiment.
    expect(relativeUncertainty({ value: 5.844, unc: 0.001 })).toBeCloseTo(1.711e-4, 7);
  });

  it('should return zero for an exact quantity', () => {
    expect(relativeUncertainty({ value: 42, unc: 0 })).toBe(0);
  });

  it('should refuse a zero value carrying a nonzero uncertainty', () => {
    expect(() => relativeUncertainty({ value: 0, unc: 0.1 })).toThrow();
  });
});

describe('sumUncertainty', () => {
  it('should add two uncertainties in quadrature, not straight', () => {
    // √(0.1² + 0.2²) = 0.2236, not 0.3. The distinction is the module's reason
    // for existing: straight addition is the worst case, not the expected one.
    const r = sumUncertainty([
      { value: 10, unc: 0.1 },
      { value: 20, unc: 0.2 },
    ]);
    expect(r.value).toBeCloseTo(30, 12);
    expect(r.unc).toBeCloseTo(Math.sqrt(0.05), 12);
    expect(r.unc).toBeLessThan(0.3);
  });

  it('should treat a subtracted term as no less uncertain than an added one', () => {
    // Subtraction does not cancel error; it compounds it. A sign error here
    // would return 0 for a difference of identical noisy readings.
    const r = sumUncertainty([
      { value: 10, unc: 0.1 },
      { value: 10, unc: 0.1, factor: -1 },
    ]);
    expect(r.value).toBeCloseTo(0, 12);
    expect(r.unc).toBeCloseTo(Math.sqrt(0.02), 12);
  });

  it('should scale a term by its coefficient', () => {
    // Three 2.000 ± 0.005 g portions: value 6, uncertainty 3 × 0.005 = 0.015.
    const r = sumUncertainty([
      { value: 2, unc: 0.005, factor: 3 },
    ]);
    expect(r.value).toBeCloseTo(6, 12);
    expect(r.unc).toBeCloseTo(0.015, 12);
  });

  it('should refuse an empty term list', () => {
    expect(() => sumUncertainty([])).toThrow();
  });
});

describe('productUncertainty', () => {
  it('should add relative uncertainties in quadrature for a product', () => {
    // 2.0 ± 0.1 times 3.0 ± 0.3: relative 5% and 10%, so √(0.05²+0.1²) = 11.18%,
    // and 11.18% of 6.0 is 0.6708.
    const r = productUncertainty([
      { value: 2, unc: 0.1 },
      { value: 3, unc: 0.3 },
    ]);
    expect(r.value).toBeCloseTo(6, 12);
    expect(r.unc).toBeCloseTo(6 * Math.sqrt(0.0025 + 0.01), 12);
  });

  it('should not add absolute uncertainties for a product', () => {
    // The failure mode: 0.1 + 0.3 = 0.4 would be the naive answer. It is far
    // too small, because the errors are relative to different magnitudes.
    const r = productUncertainty([
      { value: 2, unc: 0.1 },
      { value: 3, unc: 0.3 },
    ]);
    expect(r.unc).toBeGreaterThan(0.4);
  });

  it('should double the relative uncertainty when squaring', () => {
    // A power of 2 doubles the relative error: 2 × 1% = 2%.
    const r = productUncertainty([{ value: 10, unc: 0.1, power: 2 }]);
    expect(r.value).toBeCloseTo(100, 10);
    expect(r.unc).toBeCloseTo(2, 10);
  });

  it('should halve the relative uncertainty when taking a square root', () => {
    const r = productUncertainty([{ value: 100, unc: 2, power: 0.5 }]);
    expect(r.value).toBeCloseTo(10, 10);
    expect(r.unc).toBeCloseTo(0.1, 10);
  });

  it('should propagate a denominator through the quotient rule', () => {
    // 100 ± 1 divided by 2 ± 0.1: √(1%² + 5%²) = 5.099% of 50 = 2.5495.
    const r = productUncertainty([
      { value: 100, unc: 1 },
      { value: 2, unc: 0.1, power: -1 },
    ]);
    expect(r.value).toBeCloseTo(50, 10);
    expect(r.unc).toBeCloseTo(50 * Math.sqrt(0.0001 + 0.0025), 10);
  });

  it('should scale by an exact factor without adding uncertainty', () => {
    // 1000 mL/L is a definition, not a measurement.
    const r = productUncertainty([{ value: 2, unc: 0.02 }], { factor: 1000 });
    expect(r.value).toBeCloseTo(2000, 10);
    expect(r.unc).toBeCloseTo(20, 10);
  });
});

describe('uncertaintyFigures', () => {
  it('should keep two figures when the leading digit is 1 or 2', () => {
    expect(uncertaintyFigures(0.012)).toBe(2);
    expect(uncertaintyFigures(0.24)).toBe(2);
  });

  it('should keep one figure otherwise', () => {
    expect(uncertaintyFigures(0.4)).toBe(1);
    expect(uncertaintyFigures(0.096)).toBe(1);
  });
});

describe('significantFigures', () => {
  it('should give the value four figures against a 0.0012 uncertainty', () => {
    // 5.8437 ± 0.0012 spans decades -3 to 0, and the uncertainty keeps two
    // figures, so the value is quoted to 0 + 2 = ... four places.
    expect(significantFigures({ value: 5.8437, unc: 0.0012 })).toBe(4);
  });

  it('should give fewer figures when the uncertainty is larger', () => {
    expect(significantFigures({ value: 5.8437, unc: 0.04 })).toBe(2);
  });

  it('should return null for an exact value', () => {
    // An exact quantity is not limited by an uncertainty, so the caller is
    // free to show whatever it likes.
    expect(significantFigures({ value: 12, unc: 0 })).toBeNull();
  });
});

describe('roundToSignificant', () => {
  it('should round to four significant figures', () => {
    expect(roundToSignificant(5.843721, 4)).toBeCloseTo(5.844, 10);
  });

  it('should round a large number at the right decade', () => {
    expect(roundToSignificant(123456, 3)).toBeCloseTo(123000, 6);
  });

  it('should round a small number at the right decade', () => {
    expect(roundToSignificant(0.000123456, 3)).toBeCloseTo(0.000123, 12);
  });

  it('should return zero for zero rather than a spurious exponent', () => {
    expect(roundToSignificant(0, 3)).toBe(0);
  });
});

describe('roundPair', () => {
  it('should quote the value to the place the uncertainty occupies', () => {
    const r = roundPair({ value: 5.843721, unc: 0.0012 });
    expect(r.value).toBeCloseTo(5.8437, 10);
    expect(r.unc).toBeCloseTo(0.0012, 10);
  });

  it('should carry a rounding uncertainty up into the next decade', () => {
    // 0.96 rounds to 1.0, so the value must be quoted to the units place, not
    // to hundredths. Deciding the place from the unrounded uncertainty is what
    // gets this wrong.
    const r = roundPair({ value: 12.34, unc: 0.96 });
    expect(r.unc).toBeCloseTo(1, 10);
    expect(r.value).toBeCloseTo(12, 10);
  });

  it('should leave an exact pair alone', () => {
    expect(roundPair({ value: 5.5, unc: 0 })).toEqual({ value: 5.5, unc: 0 });
  });
});

describe('molarMassUncertainty', () => {
  it('should give NaCl as 58.44 ± 0.01 g/mol', () => {
    // Na is monoisotopic (exact), Cl is 0.01. The published figure is ±0.01,
    // and the check that Na contributes nothing is what makes this a test of
    // the table rather than of the arithmetic.
    const r = molarMassUncertainty('NaCl');
    expect(r.molarMass).toBeCloseTo(58.44, 2);
    expect(r.unc).toBeCloseTo(0.01, 6);
  });

  it('should combine every element in quadrature, not just the largest', () => {
    /*
     * Glucose C6H12O6. Per-element standard uncertainties:
     *   C 6 × 0.002 = 0.012,  H 12 × 0.0002 = 0.0024,  O 6 × 0.001 = 0.006
     *
     * √(0.012² + 0.0024² + 0.006²) = 0.013629... g/mol.
     *
     * The exact figure is asserted because the three terms are close enough in
     * size that dropping any one of them, or adding them straight (0.0204),
     * changes the answer. A range check would pass on all three.
     */
    const r = molarMassUncertainty('C6H12O6');
    expect(r.molarMass).toBeCloseTo(180.156, 2);
    expect(r.unc).toBeCloseTo(Math.sqrt(0.012 ** 2 + 0.0024 ** 2 + 0.006 ** 2), 12);
  });

  it('should report zero for a formula of monoisotopic elements only', () => {
    // Na, Al, P, F, Co, Au are all single-isotope: the molar mass is exact.
    const r = molarMassUncertainty('NaAlF4');
    expect(r.unc).toBe(0);
    expect(r.unknownElements).toEqual([]);
  });

  it('should scale the uncertainty with the subscript', () => {
    // Six carbons carry six times the uncertainty of one, then in quadrature.
    const one = molarMassUncertainty('CH4');
    const six = molarMassUncertainty('C6H14');
    expect(six.unc).toBeGreaterThan(one.unc);
  });

  it('should list elements the uncertainty table does not cover', () => {
    // Americium is not in the table, so the returned uncertainty is a lower
    // bound and the caller has to be told rather than left to assume.
    const r = molarMassUncertainty('AmO2');
    expect(r.unknownElements).toContain('Am');
  });

  it('should cover every element a common lab reagent needs', () => {
    // A spot check that the table is not full of holes where it matters.
    for (const el of ['H', 'C', 'N', 'O', 'Na', 'S', 'Cl', 'K', 'Ca', 'Fe', 'Cu', 'Zn', 'Ag', 'I']) {
      expect(ATOMIC_WEIGHT_UNCERTAINTY).toHaveProperty(el);
    }
  });
});

/*
 * Correlated inputs.
 *
 * The same pipette used three times shares one systematic offset, so its three
 * errors add LINEARLY, not in quadrature. Three uses of a 1%-error pipette give
 * 3%, not 1.7% — a factor of 1.7 that the independent model gets wrong, and
 * wrong in the optimistic direction, which is the dangerous way to be wrong.
 */
describe('correlated inputs', () => {
  it('should add perfectly correlated terms linearly, not in quadrature', () => {
    // Three 10.00 ± 0.05 mL aliquots from one pipette: rho = 1 throughout.
    // Independent would give sqrt(3)*0.05 = 0.0866; correlated gives 0.15.
    const terms = [
      { value: 10, unc: 0.05, group: 'pipette' },
      { value: 10, unc: 0.05, group: 'pipette' },
      { value: 10, unc: 0.05, group: 'pipette' },
    ];
    const independent = sumUncertainty(terms);
    const correlated = sumUncertainty(terms, { correlated: true });
    expect(independent.unc).toBeCloseTo(Math.sqrt(3) * 0.05, 10);
    expect(correlated.unc).toBeCloseTo(0.15, 10);
    // The correlated answer is LARGER, which is the point: treating correlated
    // inputs as independent understates the uncertainty.
    expect(correlated.unc).toBeGreaterThan(independent.unc);
  });

  it('should leave terms in different groups independent', () => {
    // A balance and a flask share nothing, so they still combine in quadrature.
    const terms = [
      { value: 10, unc: 0.05, group: 'balance' },
      { value: 10, unc: 0.05, group: 'flask' },
    ];
    const r = sumUncertainty(terms, { correlated: true });
    expect(r.unc).toBeCloseTo(Math.sqrt(0.05 ** 2 + 0.05 ** 2), 10);
  });

  it('should mix correlated and independent terms correctly', () => {
    // Two pipette uses (rho = 1) plus one balance reading (independent).
    // Sum: 0.1 +- ... the correlated pair contributes 0.10 linearly, then
    // combines in quadrature with the balance's 0.05.
    const terms = [
      { value: 10, unc: 0.05, group: 'pipette' },
      { value: 10, unc: 0.05, group: 'pipette' },
      { value: 10, unc: 0.05, group: 'balance' },
    ];
    const r = sumUncertainty(terms, { correlated: true });
    expect(r.unc).toBeCloseTo(Math.sqrt(0.10 ** 2 + 0.05 ** 2), 10);
  });

  it('should group by an explicit correlation matrix', () => {
    // rho = 0.5 between two terms: sigma^2 = 0.05^2 + 0.05^2 + 2*0.5*0.05*0.05
    const terms = [{ value: 1, unc: 0.05 }, { value: 1, unc: 0.05 }];
    const r = sumUncertainty(terms, { correlation: [[1, 0.5], [0.5, 1]] });
    expect(r.unc).toBeCloseTo(Math.sqrt(0.0025 + 0.0025 + 2 * 0.5 * 0.0025), 10);
  });

  it('should treat an unspecified correlation as zero', () => {
    const terms = [{ value: 1, unc: 0.05 }, { value: 1, unc: 0.05 }];
    const withMatrix = sumUncertainty(terms, { correlation: [[1, 0], [0, 1]] });
    const without = sumUncertainty(terms);
    expect(withMatrix.unc).toBeCloseTo(without.unc, 12);
  });

  it('should add correlated terms linearly through a product too', () => {
    // The same pipette diluting twice: the relative errors add linearly.
    const terms = [
      { value: 10, unc: 0.05, group: 'pipette' },
      { value: 10, unc: 0.05, group: 'pipette' },
    ];
    const indep = productUncertainty(terms);
    const corr = productUncertainty(terms, { correlated: true });
    // Each is 0.5% relative; linearly that is 1.0%, in quadrature 0.707%.
    expect(indep.unc).toBeCloseTo(100 * Math.sqrt(2 * 0.005 ** 2), 10);
    expect(corr.unc).toBeCloseTo(100 * 0.01, 10);
  });

  it('should refuse a correlation matrix of the wrong shape', () => {
    expect(() => sumUncertainty(
      [{ value: 1, unc: 0.1 }, { value: 1, unc: 0.1 }],
      { correlation: [[1]] },
    )).toThrow();
  });

  it('should refuse a correlation outside -1 to 1', () => {
    expect(() => sumUncertainty(
      [{ value: 1, unc: 0.1 }, { value: 1, unc: 0.1 }],
      { correlation: [[1, 1.5], [1.5, 1]] },
    )).toThrow();
  });

  it('should allow a negative correlation to reduce the uncertainty', () => {
    // Two errors that tend to cancel: rho = -1 makes them subtract exactly.
    const terms = [{ value: 1, unc: 0.05 }, { value: 1, unc: 0.05 }];
    const r = sumUncertainty(terms, { correlation: [[1, -1], [-1, 1]] });
    expect(r.unc).toBeCloseTo(0, 10);
  });
});

/*
 * Effective degrees of freedom.
 *
 * The Welch-Satterthwaite formula. An uncertainty built from a well-known
 * type-B contribution and a two-replicate type-A one is not known to the
 * precision the naive count suggests, and the coverage factor has to reflect
 * the smaller effective count.
 */
describe('effectiveDegreesOfFreedom', () => {
  it('should return the single component dof when there is only one', () => {
    expect(effectiveDegreesOfFreedom([{ unc: 0.1, dof: 9 }])).toBeCloseTo(9, 10);
  });

  it('should be pulled toward the least-known component when the two are comparable', () => {
    /*
     * The case the formula exists for: a well-known component (100 dof) beside
     * a poorly-known one of similar size (1 dof). nu_eff = 4.92, far below the
     * 100 the large component alone would suggest.
     *
     * The components must be COMPARABLE for this to happen — see the test
     * below, where a small 1-dof component barely moves the answer.
     */
    const eff = effectiveDegreesOfFreedom([
      { unc: 1.0, dof: 100 },
      { unc: 0.9, dof: 1 },
    ]);
    expect(eff).toBeCloseTo(4.918330580993843, 6);
    expect(eff).toBeLessThan(5);
  });

  it('should barely move when the poorly-known component is negligible', () => {
    /*
     * A 1-dof component ten times smaller than the other contributes 1% of the
     * sum of squares, so it cannot drag the count down — nu_eff is 101, just
     * above the large component's own 100.
     *
     * This is not a flaw: a component that small genuinely does not limit the
     * result. It is the reason the effective count must be computed rather
     * than assumed, because "there is a 1-dof component present" is not by
     * itself a problem.
     */
    const eff = effectiveDegreesOfFreedom([
      { unc: 1.0, dof: 100 },
      { unc: 0.1, dof: 1 },
    ]);
    expect(eff).toBeCloseTo(101, 6);
    expect(eff).toBeGreaterThan(100);
  });

  it('should sum the information when comparable components share a dof', () => {
    /*
     * Three components each with 5 dof give 12.99, not 5. Welch-Satterthwaite
     * sums the information: three independent estimates of the same quantity,
     * each from 6 replicates, together carry more than any one of them.
     *
     * An implementation that returned the minimum dof instead would fail this
     * and would be over-conservative by a factor of 2.6 in the coverage
     * factor — which is why the formula is not "take the smallest".
     */
    const eff = effectiveDegreesOfFreedom([
      { unc: 0.3, dof: 5 }, { unc: 0.4, dof: 5 }, { unc: 0.5, dof: 5 },
    ]);
    expect(eff).toBeCloseTo(12.993762993762994, 6);
    expect(eff).toBeGreaterThan(5);
  });

  it('should return null when every component is exact', () => {
    // No uncertainty at all means no limit on the precision.
    expect(effectiveDegreesOfFreedom([{ unc: 0, dof: 10 }])).toBeNull();
  });

  it('should handle an infinite dof as a known constant', () => {
    // A type-B contribution from a calibration certificate has no dof; the
    // formula treats it as infinity, so it contributes nothing to the sum.
    const eff = effectiveDegreesOfFreedom([
      { unc: 0.5, dof: Infinity },
      { unc: 0.5, dof: 9 },
    ]);
    expect(eff).toBeCloseTo(9 * (0.5 ** 2 + 0.5 ** 2) ** 2 / (0.5 ** 4), 6);
  });
});
