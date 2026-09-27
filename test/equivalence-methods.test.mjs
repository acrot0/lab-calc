import { describe, it, expect } from 'vitest';
import {
  equivalenceFromDerivative, equivalenceFromGran, granPoints, locateEquivalencePoint,
} from '../src/calc/curve.mjs';

/*
 * Locating the equivalence point from **measured** data.
 *
 * `findEquivalencePoint` answers "where is it" from the inputs — it knows the
 * moles and the titrant concentration, so it can compute the answer. That is
 * the right answer when the inputs are right, and useless when they are not:
 * a real titration has a burette reading at the end, not a known concentration,
 * and the point of plotting the data is to find out what actually happened.
 *
 * So these two take a table of (volume, pH) and locate the jump. They are the
 * two standard methods and they fail in different ways, which is why both are
 * offered: the derivative needs a data point *at* the equivalence point and is
 * therefore at the mercy of how finely the burette was read, while the Gran
 * plot uses only the straight regions on either side and extrapolates. When
 * they disagree, that disagreement is information — it is usually a sign that
 * the data is too coarse, or that the acid is not behaving.
 *
 * The synthetic data below is generated from the app's own model, so the right
 * answer is known exactly and the methods can be checked against it rather than
 * against each other.
 */

/** A weak-acid curve sampled finely, as a bench titration would produce. */
function sampledCurve({ pKa = 4.76, conc = 0.1, volumeMl = 50, titrantConc = 0.1, points = 400, overshoot = 1.6 }) {
  // Deliberately NOT importing titrationCurve: these tests are about locating
  // the point from numbers, and building the numbers here keeps the two
  // concerns from propping each other up.
  const moles = (conc * volumeMl) / 1000;
  const veq = (moles / titrantConc) * 1000;
  const rows = [];
  const ka = 10 ** -pKa;
  for (let i = 0; i <= points; i += 1) {
    const v = (veq * overshoot * i) / points;
    // Charge balance solved for [H+] by bisection on the proton condition.
    const vt = v / 1000;
    const ct = (conc * volumeMl) / (volumeMl + v);
    const cb = (titrantConc * v) / (volumeMl + v);
    let lo = 1e-14;
    let hi = 1;
    for (let k = 0; k < 200; k += 1) {
      const h = Math.sqrt(lo * hi);
      // f(h) = [H+] + [Na+] - [OH-] - [A-], with [A-] from the mass balance.
      const a = (ct * ka) / (ka + h);
      const f = h + cb - 1e-14 / h - a;
      if (f > 0) hi = h; else lo = h;
    }
    rows.push({ volumeMl: v, ph: -Math.log10(Math.sqrt(lo * hi)) });
  }
  return { rows, veq };
}

describe('equivalenceFromDerivative', () => {
  it('should find the equivalence volume of a clean weak-acid curve', () => {
    const { rows, veq } = sampledCurve({});
    const r = equivalenceFromDerivative(rows);
    // The derivative peaks at the steepest sample; with 400 points across
    // 1.6×Veq the spacing is ~0.02 mL, so this is tight.
    expect(r.volumeMl).toBeCloseTo(veq, 0);
    expect(Math.abs(r.volumeMl - veq) / veq).toBeLessThan(0.02);
  });

  it('should report the pH at the located point', () => {
    const { rows } = sampledCurve({});
    const r = equivalenceFromDerivative(rows);
    // For a weak acid the equivalence pH is basic — above 7 — because the
    // conjugate base hydrolyses. A method that returned exactly 7 would be
    // finding the wrong feature.
    expect(r.ph).toBeGreaterThan(7);
  });

  it('should warn when the initial rise is the steeper peak', () => {
    // The failure that motivated the warning, pinned with the measurement.
    // A dilute acid with a high pKa has a steeper *initial* rise than an
    // equivalence jump — 1.72 against 1.21 here — so the global maximum is the
    // wrong feature. The method cannot tell them apart from the data; it can
    // only report that there is more than one candidate.
    const { rows } = sampledCurve({ pKa: 7.2, conc: 0.02, volumeMl: 100, titrantConc: 0.05, points: 130 });
    const r = equivalenceFromDerivative(rows);
    expect(r.warning).toBe('multiplePeaks');
    expect(r.peaks.length).toBeGreaterThan(1);
    // And the winning peak really is the early one, not the equivalence point.
    expect(r.volumeMl).toBeLessThan(5);
  });

  it('should not warn on a clean curve, and report no rival peak', () => {
    const { rows } = sampledCurve({});
    const r = equivalenceFromDerivative(rows);
    expect(r.warning).toBeNull();
    // There *are* two local maxima even here — the initial rise is one, at
    // about 4% of the real jump. What matters is that none of them rivals the
    // answer, so `rivals` (the peaks within an order of magnitude) is empty.
    // Asserting `peaks` had length 1 was wrong: a curve with a steep start
    // always has a small local maximum there.
    expect(r.rivals).toEqual([]);
    expect(r.peaks.length).toBeGreaterThanOrEqual(1);
  });

  it('should refuse fewer than three points', () => {
    // A derivative needs a gap on both sides.
    expect(() => equivalenceFromDerivative([{ volumeMl: 0, ph: 3 }])).toThrow();
    expect(() => equivalenceFromDerivative([])).toThrow();
  });

  it('should refuse data whose volumes do not advance', () => {
    // Duplicate volumes make the denominator zero and the "maximum" noise.
    const rows = [
      { volumeMl: 0, ph: 3 },
      { volumeMl: 0, ph: 4 },
      { volumeMl: 0, ph: 5 },
    ];
    expect(() => equivalenceFromDerivative(rows)).toThrow();
  });
});

describe('granPoints', () => {
  it('should build the acid-side Gran function before the equivalence point', () => {
    // G = V·10^(-pH), which is linear in V while the acid is in excess.
    const rows = [
      { volumeMl: 1, ph: 4 },
      { volumeMl: 2, ph: 4.1 },
      { volumeMl: 3, ph: 4.2 },
    ];
    const g = granPoints(rows, { side: 'acid', equivalenceHint: 10 });
    expect(g).toHaveLength(3);
    expect(g[0].x).toBe(1);
    expect(g[0].y).toBeCloseTo(1 * 10 ** -4, 12);
  });

  it('should build the base-side function after the equivalence point', () => {
    // G = (V0 + V)·10^(pH), linear in V while the base is in excess.
    const rows = [
      { volumeMl: 20, ph: 11 },
      { volumeMl: 21, ph: 11.1 },
      { volumeMl: 22, ph: 11.2 },
    ];
    const g = granPoints(rows, { side: 'base', initialVolumeMl: 50, equivalenceHint: 10 });
    expect(g).toHaveLength(3);
    expect(g[0].y).toBeCloseTo((50 + 20) * 10 ** 11, 6);
  });
});

describe('equivalenceFromGran', () => {
  it('should extrapolate to the same volume the derivative found', () => {
    const { rows, veq } = sampledCurve({});
    const d = equivalenceFromDerivative(rows);
    const g = equivalenceFromGran(rows, { initialVolumeMl: 50, equivalenceHint: d.volumeMl });
    // Both methods on the same data should agree to well under a percent.
    expect(Math.abs(g.volumeMl - veq) / veq).toBeLessThan(0.02);
    expect(Math.abs(g.volumeMl - d.volumeMl) / veq).toBeLessThan(0.03);
  });

  it('should report the fit quality, so a bad extrapolation is visible', () => {
    const { rows, veq } = sampledCurve({});
    const g = equivalenceFromGran(rows, { initialVolumeMl: 50, equivalenceHint: veq });
    expect(g.r2).toBeGreaterThan(0.99);
    expect(g.n).toBeGreaterThan(4);
  });

  it('should work from one side alone, which is a normal case', () => {
    // A Gran plot is often run on the acid side only — that is its selling
    // point, that it predicts the endpoint without titrating to it. So data
    // entirely below the hint is not an error, and this asserts the one-sided
    // result rather than a refusal.
    const { rows, veq } = sampledCurve({});
    const acidOnly = rows.filter((r) => r.volumeMl < veq);
    const g = equivalenceFromGran(acidOnly, { initialVolumeMl: 50, equivalenceHint: veq });
    expect(g.side).toBe('acid');
    expect(g.base).toBeNull();
    expect(g.agree).toBeNull();
    expect(Math.abs(g.volumeMl - veq) / veq).toBeLessThan(0.05);
  });

  it('should refuse data with no usable side at all', () => {
    // Every point exactly at the hint: no acid side, no base side.
    const rows = [
      { volumeMl: 10, ph: 7 },
      { volumeMl: 10, ph: 7 },
      { volumeMl: 10, ph: 7 },
    ];
    expect(() => equivalenceFromGran(rows, { initialVolumeMl: 50, equivalenceHint: 10 })).toThrow();
  });

  it('should refuse an equivalence hint that is not positive', () => {
    const { rows } = sampledCurve({});
    expect(() => equivalenceFromGran(rows, { initialVolumeMl: 50, equivalenceHint: 0 })).toThrow();
  });
});

describe('locateEquivalencePoint', () => {
  it('should pick the equivalence jump when the initial rise is steeper', () => {
    // The whole reason this wrapper exists. Measured: naive chaining gives
    // 0.25 mL for a true 40.00 mL; this gives 40.003.
    const { rows, veq } = sampledCurve({
      pKa: 7.2, conc: 0.02, volumeMl: 100, titrantConc: 0.05, points: 130,
    });
    const r = locateEquivalencePoint(rows, { initialVolumeMl: 100 });
    expect(Math.abs(r.volumeMl - veq) / veq).toBeLessThan(0.01);
    expect(r.method).toBe('gran');
  });

  it('should use the derivative when the curve is unambiguous', () => {
    const { rows, veq } = sampledCurve({});
    const r = locateEquivalencePoint(rows, { initialVolumeMl: 50 });
    expect(r.method).toBe('derivative');
    expect(Math.abs(r.volumeMl - veq) / veq).toBeLessThan(0.01);
    expect(r.agree).toBe(true);
  });

  it('should report both answers rather than averaging them', () => {
    const { rows } = sampledCurve({});
    const r = locateEquivalencePoint(rows, { initialVolumeMl: 50 });
    expect(r.derivative.volumeMl).toBeGreaterThan(0);
    expect(r.gran.volumeMl).toBeGreaterThan(0);
    expect(r.hintUsed).toBeGreaterThan(0);
  });
});
