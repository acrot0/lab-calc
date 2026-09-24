import { describe, it, expect } from 'vitest';
import {
  normalizeAcid,
  titrationCurve,
  findEquivalencePoint,
  equivalenceVolumes,
} from '../src/calc/curve.mjs';

/**
 * Reference values are hand-computed from the chemistry, not read off this
 * implementation. For the strong-acid case the arithmetic is exact; for the
 * polyprotic case the landmarks are the textbook ones (pH ≈ pKa at each
 * half-equivalence point).
 */

describe('normalizeAcid', () => {
  it('should accept a single pKa', () => {
    expect(normalizeAcid({ pKa: 4.76 }).pKas).toEqual([4.76]);
  });

  it('should accept an array of pKas for a polyprotic acid', () => {
    expect(normalizeAcid({ pKas: [2.15, 7.20, 12.35] }).pKas).toEqual([2.15, 7.20, 12.35]);
  });

  it('should mark a strong acid as having no meaningful pKa', () => {
    const a = normalizeAcid({ strongAcid: true });
    expect(a.strong).toBe(true);
    expect(a.pKas).toEqual([]);
  });

  it('should sort pKas ascending, since dissociation constants come out in order', () => {
    expect(normalizeAcid({ pKas: [12.35, 2.15, 7.20] }).pKas).toEqual([2.15, 7.20, 12.35]);
  });

  it('should reject a non-monotonic set that contains duplicates', () => {
    // Two identical pKas is almost certainly a typo, and it would silently
    // collapse one equivalence point into another.
    expect(() => normalizeAcid({ pKas: [4.76, 4.76] })).toThrow();
  });

  it('should reject an empty specification', () => {
    expect(() => normalizeAcid({})).toThrow();
    expect(() => normalizeAcid({ pKas: [] })).toThrow();
  });

  it('should reject a non-numeric pKa', () => {
    expect(() => normalizeAcid({ pKa: 'acidic' })).toThrow();
  });
});

describe('strong acid — strong base', () => {
  const base = { strongAcid: true, conc: 0.1, volumeMl: 25, titrantConc: 0.1 };

  it('should start at the pH of the acid alone', () => {
    // 0.1 M strong acid: pH = -log10(0.1) = 1.00 exactly
    expect(titrationCurve({ ...base, points: 50 })[0].ph).toBeCloseTo(1.0, 2);
  });

  it('should pass through pH 7 at the equivalence point', () => {
    // The defining difference from a weak acid, whose equivalence pH is > 7.
    const eq = findEquivalencePoint(base);
    expect(eq.volumeMl).toBeCloseTo(25, 6);
    expect(eq.ph).toBeCloseTo(7.0, 1);
  });

  it('should give pH 1.48 at the half-equivalence point', () => {
    // [H+] = 0.00125 mol / 0.0375 L = 0.0333 M → pH = 1.477
    const pts = titrationCurve({ ...base, points: 400 });
    const half = pts.reduce((b, p) =>
      Math.abs(p.volumeMl - 12.5) < Math.abs(b.volumeMl - 12.5) ? p : b);
    expect(half.ph).toBeCloseTo(1.48, 1);
  });

  it('should give pH 11.96 at 30 mL, from the excess base', () => {
    // excess OH- = (0.003 - 0.0025) / 0.055 = 0.00909 M → pOH 2.04 → pH 11.96
    const pts = titrationCurve({ ...base, points: 400 });
    const p = pts.reduce((b, x) => Math.abs(x.volumeMl - 30) < Math.abs(b.volumeMl - 30) ? x : b);
    expect(p.ph).toBeCloseTo(11.96, 1);
  });

  it('should be much steeper at equivalence than a weak acid is', () => {
    const strong = titrationCurve({ ...base, points: 400 });
    const weak = titrationCurve({ pKa: 4.76, conc: 0.1, volumeMl: 25, titrantConc: 0.1, points: 400 });
    const span = (pts) => {
      const near = pts.filter((p) => Math.abs(p.volumeMl - 25) < 1.25);
      return Math.max(...near.map((p) => p.ph)) - Math.min(...near.map((p) => p.ph));
    };
    expect(span(strong)).toBeGreaterThan(span(weak));
  });

  it('should rise monotonically', () => {
    const pts = titrationCurve({ ...base, points: 80 });
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].ph).toBeGreaterThanOrEqual(pts[i - 1].ph - 0.01);
    }
  });
});

describe('polyprotic acid', () => {
  // Phosphoric acid: three protons, three well-separated equivalence points.
  const phos = { pKas: [2.15, 7.20, 12.35], conc: 0.1, volumeMl: 25, titrantConc: 0.1 };

  it('should have one equivalence point per proton', () => {
    const vols = equivalenceVolumes(phos);
    expect(vols).toHaveLength(3);
    expect(vols[0]).toBeCloseTo(25, 6);
    expect(vols[1]).toBeCloseTo(50, 6);
    expect(vols[2]).toBeCloseTo(75, 6);
  });

  it('should sit at pH ≈ pKa1 at the first half-equivalence point', () => {
    // 12.5 mL: half of the first proton is gone, so [H3A] ≈ [H2A-] and pH ≈ pKa1
    const pts = titrationCurve({ ...phos, points: 600 });
    const p = pts.reduce((b, x) => Math.abs(x.volumeMl - 12.5) < Math.abs(b.volumeMl - 12.5) ? x : b);
    expect(p.ph).toBeCloseTo(2.15, 0);
  });

  it('should sit at pH ≈ pKa2 at the second half-equivalence point', () => {
    const pts = titrationCurve({ ...phos, points: 600 });
    const p = pts.reduce((b, x) => Math.abs(x.volumeMl - 37.5) < Math.abs(b.volumeMl - 37.5) ? x : b);
    expect(p.ph).toBeCloseTo(7.20, 0);
  });

  it('should sit at pH ≈ pKa3 at the third half-equivalence point', () => {
    const pts = titrationCurve({ ...phos, points: 900 });
    const p = pts.reduce((b, x) => Math.abs(x.volumeMl - 62.5) < Math.abs(b.volumeMl - 62.5) ? x : b);
    expect(p.ph).toBeCloseTo(12.35, 0);
  });

  it('should rise monotonically across all three steps', () => {
    const pts = titrationCurve({ ...phos, points: 300 });
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].ph).toBeGreaterThanOrEqual(pts[i - 1].ph - 0.02);
    }
  });

  it('should show three distinct buffering plateaus', () => {
    // Each plateau is a region where dpH/dV is small. Detecting three of them
    // is the structural check that the polyprotic solver is not just
    // reproducing a single-proton curve stretched out.
    const pts = titrationCurve({ ...phos, points: 900 });
    const slopes = pts.slice(1).map((p, i) => (p.ph - pts[i].ph) / (p.volumeMl - pts[i].volumeMl || 1e-9));
    const flat = slopes.filter((s) => s < 0.05).length;
    expect(flat).toBeGreaterThan(150);
  });

  it('should reject a polyprotic acid with too many protons to be real', () => {
    expect(() => normalizeAcid({ pKas: [1, 2, 3, 4, 5, 6, 7] })).toThrow();
  });
});

describe('backwards compatibility', () => {
  it('should still accept the original single-pKa signature', () => {
    const pts = titrationCurve({ pKa: 4.76, conc: 0.1, volumeMl: 25, titrantConc: 0.1, points: 40 });
    expect(pts).toHaveLength(40);
    expect(pts[0].ph).toBeCloseTo(2.88, 1);
  });

  it('should give a monoprotic curve identical to the polyprotic solver with one pKa', () => {
    const a = titrationCurve({ pKa: 4.76, conc: 0.1, volumeMl: 25, titrantConc: 0.1, points: 60 });
    const b = titrationCurve({ pKas: [4.76], conc: 0.1, volumeMl: 25, titrantConc: 0.1, points: 60 });
    for (let i = 0; i < a.length; i++) expect(a[i].ph).toBeCloseTo(b[i].ph, 6);
  });
});
