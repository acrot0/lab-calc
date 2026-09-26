import { describe, expect, it } from 'vitest';
import {
  ATOMIC_WEIGHT_UNCERTAINTY, molarMassUncertainty, productUncertainty, quantity,
  relativeUncertainty, roundPair, roundToSignificant, significantFigures,
  sumUncertainty, uncertaintyFigures,
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
