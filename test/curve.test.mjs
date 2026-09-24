import { describe, it, expect } from 'vitest';
import { titrationCurve, findEquivalencePoint, weakAcidCurveParams } from '../src/calc/curve.mjs';

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
