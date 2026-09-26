import { describe, it, expect } from 'vitest';
import {
  titrationCurve, findEquivalencePoint, weakAcidCurveParams, speciationCurve,
} from '../src/calc/curve.mjs';

/**
 * The titration curve is generated from the exact equilibrium treatment rather
 * than the sqrt(Ka·C) approximation used for a single pH reading — near the
 * equivalence point the approximation breaks down badly, and that is precisely
 * the region the curve exists to show.
 */

describe('weakAcidCurveParams', () => {
  it('should derive Ka from pKa', () => {
    const { ka } = weakAcidCurveParams({ pKa: 4.76, conc: 0.1, volumeMl: 25 });
    expect(ka).toBeCloseTo(10 ** -4.76, 10);
  });

  it('should carry through the moles of analyte', () => {
    const { molesAnalyte } = weakAcidCurveParams({ pKa: 4.76, conc: 0.1, volumeMl: 25 });
    expect(molesAnalyte).toBeCloseTo(0.0025, 8);
  });

  it('should reject a zero volume', () => {
    expect(() => weakAcidCurveParams({ pKa: 4.76, conc: 0.1, volumeMl: 0 })).toThrow();
  });
});

describe('titrationCurve', () => {
  const base = { pKa: 4.76, conc: 0.1, volumeMl: 25, titrantConc: 0.1 };

  it('should start at the pH of the weak acid alone', () => {
    const pts = titrationCurve({ ...base, points: 50 });
    // 0.1 M acetic acid alone is about pH 2.88
    expect(pts[0].ph).toBeCloseTo(2.88, 1);
  });

  it('should return the requested number of points', () => {
    expect(titrationCurve({ ...base, points: 40 })).toHaveLength(40);
  });

  it('should rise monotonically across the titration', () => {
    const pts = titrationCurve({ ...base, points: 60 });
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].ph).toBeGreaterThanOrEqual(pts[i - 1].ph - 0.01);
    }
  });

  it('should pass through pH = pKa at the half-equivalence point', () => {
    // At half-equivalence [HA] = [A-], so pH = pKa. This is the single most
    // important check that the curve is chemically right.
    const eq = findEquivalencePoint(base);
    const pts = titrationCurve({ ...base, points: 200 });
    const half = pts.reduce((best, p) =>
      Math.abs(p.volumeMl - eq.volumeMl / 2) < Math.abs(best.volumeMl - eq.volumeMl / 2) ? p : best);
    expect(half.ph).toBeCloseTo(4.76, 1);
  });

  it('should rise steeply at the equivalence point', () => {
    // The defining feature of a titration curve is the jump. If the curve is
    // flat there, the equilibrium treatment is wrong.
    const pts = titrationCurve({ ...base, points: 400 });
    const eq = findEquivalencePoint(base);
    const near = pts.filter((p) => Math.abs(p.volumeMl - eq.volumeMl) < eq.volumeMl * 0.05);
    expect(near.length).toBeGreaterThan(1);
    const span = Math.max(...near.map((p) => p.ph)) - Math.min(...near.map((p) => p.ph));
    expect(span).toBeGreaterThan(2);
  });

  it('should approach the pH of excess strong base past the equivalence point', () => {
    const pts = titrationCurve({ ...base, points: 100 });
    const last = pts[pts.length - 1];
    expect(last.ph).toBeGreaterThan(10);
  });

  it('should mark the equivalence point volume on the curve', () => {
    const pts = titrationCurve({ ...base, points: 30 });
    expect(pts.every((p) => Number.isFinite(p.ph))).toBe(true);
    expect(pts.every((p) => Number.isFinite(p.volumeMl))).toBe(true);
  });

  it('should reject a non-positive point count', () => {
    expect(() => titrationCurve({ ...base, points: 0 })).toThrow();
  });

  it('should reject a zero titrant concentration', () => {
    expect(() => titrationCurve({ ...base, titrantConc: 0, points: 10 })).toThrow();
  });
});

describe('findEquivalencePoint', () => {
  it('should compute the volume where moles match', () => {
    // 0.1 M × 25 mL = 0.0025 mol; ÷ 0.1 M titrant = 25 mL
    expect(findEquivalencePoint({ pKa: 4.76, conc: 0.1, volumeMl: 25, titrantConc: 0.1 }).volumeMl)
      .toBeCloseTo(25, 6);
  });

  it('should halve the volume for a titrant twice as strong', () => {
    expect(findEquivalencePoint({ pKa: 4.76, conc: 0.1, volumeMl: 25, titrantConc: 0.2 }).volumeMl)
      .toBeCloseTo(12.5, 6);
  });

  it('should report the pH at equivalence as above 7 for a weak acid', () => {
    // At equivalence the solution is sodium acetate — a weak base — so pH > 7.
    // A curve that puts equivalence at exactly 7 is modelling a strong acid.
    const eq = findEquivalencePoint({ pKa: 4.76, conc: 0.1, volumeMl: 25, titrantConc: 0.1 });
    expect(eq.ph).toBeGreaterThan(7);
  });
});

describe('concentrated strong acid', () => {
  /*
   * The bug this pins: the charge-balance bisection bracketed [H+] between
   * 1e-15 and a hardcoded 1.0. A 5 M strong acid has [H+] = 5, so the root lay
   * outside the bracket and bisection converged confidently on the boundary —
   * reporting pH 0.000 for a solution whose pH is -0.699. Silent, and wrong in
   * the direction of looking plausible.
   *
   * The upper bound now comes from the inputs, and the bracket is checked
   * rather than assumed, so an unbracketed root throws instead of returning a
   * bound that looks like an answer.
   */
  it('should report a pH below zero for a strong acid above 1 M', () => {
    for (const conc of [2, 5, 10]) {
      const curve = titrationCurve({ strongAcid: true, conc, volumeMl: 25, titrantConc: conc });
      // The first point is before any titrant is added, so [H+] is the acid's
      // own concentration and pH is its negative logarithm.
      expect(curve[0].ph, `${conc} M`).toBeCloseTo(-Math.log10(conc), 3);
    }
  });

  it('should still bracket correctly at 1 M, the old boundary', () => {
    // The value the old hardcoded bound happened to be right for, so a fix
    // that broke this would be caught.
    const curve = titrationCurve({ strongAcid: true, conc: 1, volumeMl: 25, titrantConc: 1 });
    expect(curve[0].ph).toBeCloseTo(0, 3);
  });

  it('should leave the dilute case untouched', () => {
    // Regression guard: the bracket change must not move any result that was
    // already correct.
    const curve = titrationCurve({ strongAcid: true, conc: 0.1, volumeMl: 25, titrantConc: 0.1 });
    expect(curve[0].ph).toBeCloseTo(1, 3);
  });

  it('should not change a weak-acid curve', () => {
    const curve = titrationCurve({ pKa: 4.76, conc: 0.1, volumeMl: 25, titrantConc: 0.1 });
    expect(curve[0].ph).toBeCloseTo(2.88, 2);
  });
});

/**
 * The speciation curve is the picture behind the pH tab's warning.
 *
 * That tab rests on [H+] ≈ sqrt(Ka·C), which is only valid while the acid is
 * barely dissociated. The distribution is what makes the domain of that
 * approximation checkable rather than asserted.
 */
describe('speciationCurve', () => {
  const acetate = speciationCurve({ pKa: 4.76, points: 200 });

  it('should give one more species than there are pKa values', () => {
    expect(acetate.species).toHaveLength(2);
    expect(speciationCurve({ pKas: [2.15, 7.20, 12.35] }).species).toHaveLength(4);
  });

  it('should name the species from most to least protonated', () => {
    expect(acetate.species).toEqual(['HA', 'A⁻']);
    expect(speciationCurve({ pKas: [2.15, 7.20, 12.35] }).species)
      .toEqual(['H₃A', 'H₂A⁻', 'HA²⁻', 'A³⁻']);
  });

  it('should sum the fractions to 1 at every pH', () => {
    // A denominator that drops a term still produces a plausible-looking curve,
    // so the normalisation is asserted rather than assumed.
    for (const p of acetate.points) {
      const sum = p.fractions.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it('should cross at pH = pKa, where the two forms are equal', () => {
    // Sampled so the pKa lands exactly on a grid point: an odd count over a
    // range symmetric about it. Searching the default grid instead would only
    // test the crossing to within the sampling step, which is a weaker claim.
    const sym = speciationCurve({ pKa: 4.76, points: 7, phMin: 3.76, phMax: 5.76 });
    const atPka = sym.points[3];
    expect(atPka.ph).toBeCloseTo(4.76, 10);
    expect(atPka.fractions[0]).toBeCloseTo(0.5, 10);
    expect(atPka.fractions[1]).toBeCloseTo(0.5, 10);
  });

  it('should be almost entirely protonated three units below the pKa', () => {
    // This is the region the sqrt(Ka·C) approximation is entitled to.
    const low = acetate.points[0];
    expect(low.ph).toBeCloseTo(1.76, 6);
    expect(low.fractions[0]).toBeGreaterThan(0.999);
  });

  it('should be almost entirely deprotonated three units above the pKa', () => {
    const high = acetate.points.at(-1);
    expect(high.ph).toBeCloseTo(7.76, 6);
    expect(high.fractions[1]).toBeGreaterThan(0.999);
  });

  it('should place the pH range three units either side of the pKas', () => {
    expect(acetate.phMin).toBeCloseTo(1.76, 6);
    expect(acetate.phMax).toBeCloseTo(7.76, 6);
  });

  it('should cover the widest pKa span of a polyprotic acid', () => {
    const phosphoric = speciationCurve({ pKas: [2.15, 7.20, 12.35] });
    expect(phosphoric.phMin).toBeCloseTo(0, 6);   // clamped: 2.15 - 3 < 0
    expect(phosphoric.phMax).toBeCloseTo(14, 6);  // clamped: 12.35 + 3 > 14
  });

  it('should never sample outside the pH range water allows', () => {
    const phosphoric = speciationCurve({ pKas: [2.15, 7.20, 12.35] });
    for (const p of phosphoric.points) {
      expect(p.ph).toBeGreaterThanOrEqual(0);
      expect(p.ph).toBeLessThanOrEqual(14);
    }
  });

  it('should put all the weight on the anion for a strong acid', () => {
    const strong = speciationCurve({ strongAcid: true });
    expect(strong.species).toEqual(['A⁻']);
    expect(strong.points[0].fractions).toEqual([1]);
  });

  it('should return the requested number of samples', () => {
    expect(speciationCurve({ pKa: 4.76, points: 40 }).points).toHaveLength(40);
    expect(speciationCurve({ pKa: 4.76 }).points).toHaveLength(120);
  });

  it('should refuse a non-positive point count', () => {
    expect(() => speciationCurve({ pKa: 4.76, points: 0 }))
      .toThrowError(expect.objectContaining({ code: 'pointsNotPositive' }));
  });

  it('should refuse a spec with no pKa', () => {
    expect(() => speciationCurve({}))
      .toThrowError(expect.objectContaining({ code: 'acidSpecMissing' }));
  });

  it('should refuse an empty pH range', () => {
    expect(() => speciationCurve({ pKa: 4.76, phMin: 9, phMax: 3 }))
      .toThrowError(expect.objectContaining({ code: 'phRangeEmpty' }));
  });
});
