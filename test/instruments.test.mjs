import { describe, it, expect } from 'vitest';
import {
  FLASK_TOLERANCE_ML, PIPETTE_TOLERANCE_ML, BURETTE_TOLERANCE_ML,
  rectangularStandardUncertainty, toleranceFor, glasswareUncertainty,
  weighingUncertainty, instrumentUncertainty, INSTRUMENT_KINDS,
  spectrophotometerUncertainty, cuvetteUncertainty,
  SPECTROPHOTOMETER_ACCURACY_A, CUVETTE_PATH_TOLERANCE_MM,
} from '../src/calc/instruments.mjs';

/*
 * Instrument tolerances, and the uncertainty they put on a volume or a mass.
 *
 * `uncertainty.mjs` knows how to propagate; it does not know what the inputs
 * are worth. Without this module the propagation had nothing to propagate — the
 * engine was complete and unused, which is why every result still quoted digits
 * the glassware cannot support.
 *
 * The numbers are the published class A limits, not estimates. A tolerance is
 * the manufacturer's guarantee that the true value lies inside ±a, with no
 * information about where — which is exactly a rectangular distribution, so the
 * standard uncertainty is a/√3. That is GUM 4.3.7 and Eurachem QUAM:2012 §8.1.4,
 * not a convention invented here.
 */

describe('rectangularStandardUncertainty', () => {
  it('should divide the half-width by the square root of three', () => {
    // A 100 mL class A flask is certified to ±0.10 mL, so u = 0.0577 mL.
    expect(rectangularStandardUncertainty(0.1)).toBeCloseTo(0.057735, 6);
  });

  it('should be linear in the half-width', () => {
    expect(rectangularStandardUncertainty(0.2)).toBeCloseTo(2 * rectangularStandardUncertainty(0.1), 12);
  });

  it('should reject a negative half-width', () => {
    expect(() => rectangularStandardUncertainty(-1)).toThrow();
  });
});

describe('toleranceFor', () => {
  it('should return the published tolerance for a listed size', () => {
    expect(toleranceFor('flask', 100)).toBe(FLASK_TOLERANCE_ML[100]);
    expect(toleranceFor('pipette', 25)).toBe(PIPETTE_TOLERANCE_ML[25]);
    expect(toleranceFor('burette', 50)).toBe(BURETTE_TOLERANCE_ML[50]);
  });

  it('should fall back to the next smaller listed size for an unlisted one', () => {
    // ASTM E288 §1.1.3: an unlisted capacity may be called class A only if it
    // meets the tolerance of the next smaller standard product. So a 300 mL
    // flask is guaranteed to the 250 mL tolerance, and quoting it is not
    // optimistic — it is what the standard promises.
    expect(toleranceFor('flask', 300)).toBe(FLASK_TOLERANCE_ML[250]);
    expect(toleranceFor('pipette', 15)).toBe(PIPETTE_TOLERANCE_ML[10]);
  });

  it('should use the largest listed size above the table', () => {
    expect(toleranceFor('flask', 5000)).toBe(FLASK_TOLERANCE_ML[2000]);
  });

  it('should reject a volume below the smallest listed size', () => {
    // There is no class A flask smaller than 5 mL. Extrapolating downwards
    // would invent a tolerance tighter than any product, which understates the
    // uncertainty — the dangerous direction.
    expect(() => toleranceFor('flask', 1)).toThrow();
  });

  it('should reject an unknown instrument kind', () => {
    expect(() => toleranceFor('beaker', 100)).toThrow();
  });

  it('should expose every table it can look up', () => {
    expect(INSTRUMENT_KINDS).toEqual(['flask', 'pipette', 'burette']);
  });
});

describe('glasswareUncertainty', () => {
  it('should give the tolerance term at the reference temperature', () => {
    const q = glasswareUncertainty({ kind: 'flask', nominalMl: 100 });
    expect(q.value).toBe(100);
    // Tolerance only, at 20 °C: 0.10/√3.
    expect(q.unc).toBeCloseTo(0.057735, 6);
    expect(q.components.map((c) => c.name)).toEqual(['tolerance']);
  });

  it('should add a temperature term away from the reference', () => {
    // A flask is calibrated to contain its nominal volume at 20 °C. Used at
    // 25 °C the water is less dense than the glass it sits in, so the flask
    // delivers more than its mark says. The coefficient is the difference
    // between the volumetric expansion of water (2.1e-4/K) and of borosilicate
    // (1e-5/K), which is why it is 2.1e-4 and not the water figure alone.
    const q = glasswareUncertainty({ kind: 'flask', nominalMl: 100, temperatureC: 25 });
    expect(q.components.map((c) => c.name)).toEqual(['tolerance', 'temperature']);
    const temp = q.components.find((c) => c.name === 'temperature');
    expect(temp.unc).toBeCloseTo((100 * 2.1e-4 * 5) / Math.sqrt(3), 6);
    expect(q.unc).toBeGreaterThan(0.057735);
  });

  it('should not add a temperature term at the reference temperature', () => {
    const q = glasswareUncertainty({ kind: 'flask', nominalMl: 100, temperatureC: 20 });
    expect(q.components).toHaveLength(1);
  });

  it('should double the tolerance for class B', () => {
    // Class B is twice the class A tolerance at every size, by both standards.
    const a = glasswareUncertainty({ kind: 'flask', nominalMl: 250 });
    const b = glasswareUncertainty({ kind: 'flask', nominalMl: 250, grade: 'B' });
    expect(b.unc / a.unc).toBeCloseTo(2, 6);
  });

  it('should combine the terms in quadrature, not by addition', () => {
    const q = glasswareUncertainty({ kind: 'flask', nominalMl: 100, temperatureC: 25 });
    const [t, temp] = q.components;
    expect(q.unc).toBeCloseTo(Math.hypot(t.unc, temp.unc), 12);
  });
});

describe('weighingUncertainty', () => {
  it('should combine readability and linearity in quadrature', () => {
    const q = weighingUncertainty({ massG: 0.5844, readabilityG: 0.0001, linearityG: 0.0002 });
    const readability = (0.0001 / 2) / Math.sqrt(3);
    const linearity = (0.0002 / Math.sqrt(3)) * Math.sqrt(2);
    expect(q.value).toBeCloseTo(0.5844, 9);
    expect(q.unc).toBeCloseTo(Math.hypot(readability, linearity), 9);
  });

  it('should count linearity twice when the balance is tared', () => {
    // Weighing by difference reads the balance twice, and the linearity error
    // is the same curve both times. Eurachem QUAM:2012 works the tare and the
    // gross separately for exactly this reason; omitting it understates the
    // uncertainty by 41%.
    const tared = weighingUncertainty({ massG: 1, readabilityG: 0.0001, linearityG: 0.0002 });
    const direct = weighingUncertainty({ massG: 1, readabilityG: 0.0001, linearityG: 0.0002, tared: false });
    expect(tared.unc).toBeGreaterThan(direct.unc);
    const lin = direct.components.find((c) => c.name === 'linearity');
    expect(tared.components.find((c) => c.name === 'linearity').unc).toBeCloseTo(lin.unc * Math.SQRT2, 9);
  });

  it('should give the readability term a rectangular distribution', () => {
    // The display rounds to the nearest increment, so the true value lies
    // within ±d/2 with equal probability — half-width d/2, not d.
    const q = weighingUncertainty({ massG: 1, readabilityG: 0.0001, linearityG: 0 });
    expect(q.unc).toBeCloseTo((0.0001 / 2) / Math.sqrt(3), 9);
  });

  it('should reject a negative mass', () => {
    expect(() => weighingUncertainty({ massG: -1, readabilityG: 0.0001 })).toThrow();
  });
});

describe('instrumentUncertainty', () => {
  it('should dispatch on the instrument kind', () => {
    const v = instrumentUncertainty({ kind: 'pipette', nominalMl: 25 });
    expect(v.value).toBe(25);
    expect(v.unc).toBeCloseTo(0.03 / Math.sqrt(3), 9);
  });

  it('should handle a balance by name', () => {
    const m = instrumentUncertainty({ kind: 'balance', massG: 0.5, readabilityG: 0.0001, linearityG: 0.0002 });
    expect(m.value).toBe(0.5);
    expect(m.unc).toBeGreaterThan(0);
  });

  it('should reject an unknown kind', () => {
    expect(() => instrumentUncertainty({ kind: 'spatula', nominalMl: 1 })).toThrow();
  });
});

/*
 * The two instruments that are not volumetric glassware or a balance.
 *
 * Both were added because the spectrophotometry tab had no budget at all, and
 * both behave unlike the entries above in a way worth pinning down: the
 * photometer's term is absolute in absorbance, so its *relative* size depends
 * on the reading, while the cell's is fixed.
 */
describe('spectrophotometerUncertainty', () => {
  it('should give the photometric term a rectangular distribution', () => {
    const s = spectrophotometerUncertainty({ absorbance: 0.75, blanked: false });
    expect(s.unc).toBeCloseTo(SPECTROPHOTOMETER_ACCURACY_A / Math.sqrt(3), 9);
  });

  it('should count the blank as a second reading when the instrument was zeroed', () => {
    // Absorbance is a difference of two readings, so the instrument's own
    // accuracy applies to each — the balance's tare trap in another instrument.
    const s = spectrophotometerUncertainty({ absorbance: 0.75, blanked: true });
    expect(s.unc).toBeCloseTo(SPECTROPHOTOMETER_ACCURACY_A / Math.sqrt(3) * Math.SQRT2, 9);
    expect(s.components.find((c) => c.name === 'blank').counted).toBe(2);
  });

  it('should make the relative uncertainty grow as the reading falls', () => {
    // The reason the working range is 0.2-0.8 AU: at 0.8 AU the term is about
    // 0.3%, at 0.05 AU about 5%. A single relative figure would hide that.
    const high = spectrophotometerUncertainty({ absorbance: 0.8 });
    const low = spectrophotometerUncertainty({ absorbance: 0.05 });
    expect(high.unc).toBeCloseTo(low.unc, 12);
    expect(low.unc / 0.05).toBeGreaterThan(10 * (high.unc / 0.8));
  });

  it('should reject a negative absorbance', () => {
    expect(() => spectrophotometerUncertainty({ absorbance: -0.1 })).toThrow();
  });

  it('should reject a zero accuracy, which would report a perfect instrument', () => {
    expect(() => spectrophotometerUncertainty({ absorbance: 0.5, accuracyA: 0 })).toThrow();
  });
});

describe('cuvetteUncertainty', () => {
  it('should convert the path tolerance through a rectangular distribution', () => {
    const c = cuvetteUncertainty({ pathMm: 10 });
    expect(c.unc).toBeCloseTo(CUVETTE_PATH_TOLERANCE_MM / Math.sqrt(3), 9);
  });

  it('should keep the path in mm rather than converting to cm', () => {
    // The tab works in cm because Beer's law with a molar absorptivity uses cm,
    // and the conversion is the caller's job — a function that guessed would be
    // wrong for whichever caller guessed differently.
    expect(cuvetteUncertainty({ pathMm: 10 }).value).toBe(10);
  });

  it('should make a short-path cell relatively worse, not better', () => {
    // The same absolute tolerance on a smaller path: 1 mm is 2.9%, not 0.29%.
    // A short cell keeps a concentrated sample on scale; it does not improve
    // the measurement.
    const ten = cuvetteUncertainty({ pathMm: 10 });
    const one = cuvetteUncertainty({ pathMm: 1 });
    expect(one.unc / 1).toBeGreaterThan(9 * (ten.unc / 10));
  });

  it('should reject a zero or negative path', () => {
    expect(() => cuvetteUncertainty({ pathMm: 0 })).toThrow();
  });
});

describe('instrumentUncertainty dispatch for the new kinds', () => {
  it('should dispatch a cuvette by name', () => {
    expect(instrumentUncertainty({ kind: 'cuvette', pathMm: 10 }).value).toBe(10);
  });

  it('should dispatch a spectrophotometer by name', () => {
    expect(instrumentUncertainty({ kind: 'spectrophotometer', absorbance: 0.5 }).unit).toBe('A');
  });
});
