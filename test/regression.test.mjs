import { describe, it, expect } from 'vitest';
import { standardCurve } from '../src/calc/reagent.mjs';

/**
 * The regression statistics are the part of the standard curve a scientist
 * checks before trusting it, so they are tested against hand-computed values
 * rather than against whatever the implementation happens to produce.
 */
describe('standardCurve residuals and errors', () => {
  it('should give zero residuals for points that lie exactly on a line', () => {
    // y = 2x + 1, so every residual is zero by construction.
    const fit = standardCurve([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }]);
    expect(fit.slope).toBeCloseTo(2, 10);
    expect(fit.intercept).toBeCloseTo(1, 10);
    expect(fit.r2).toBeCloseTo(1, 10);
    expect(fit.standardError).toBeCloseTo(0, 10);
    for (const r of fit.residuals) expect(r).toBeCloseTo(0, 10);
  });

  it('should compute residuals against the fitted line, not the data', () => {
    // Three points with one pulled off the line. The fit moves toward the
    // outlier, so no residual is zero — which is the point: a residual is
    // measured from the line, not from where the point "should" be.
    const fit = standardCurve([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 4 }]);
    expect(fit.residuals).toHaveLength(3);
    const sum = fit.residuals.reduce((a, b) => a + b, 0);
    // Least squares always gives residuals summing to zero.
    expect(sum).toBeCloseTo(0, 10);
    // And they are not all equal, so this is not a degenerate fit.
    expect(new Set(fit.residuals.map((r) => r.toFixed(6))).size).toBeGreaterThan(1);
  });

  it('should keep residuals in the same order as the input points', () => {
    // The residual plot pairs each value with its x, so a reordered array
    // would attribute an outlier to the wrong standard.
    const points = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 4 }, { x: 3, y: 3 }];
    const fit = standardCurve(points);
    expect(fit.residuals).toHaveLength(points.length);
    // The last point sits below the trend, so its residual is negative.
    expect(fit.residuals[3]).toBeLessThan(0);
  });

  it('should give the residual standard deviation, not the residual sum', () => {
    // Hand-computed for points (0,1), (1,4), (2,5):
    //   mean x = 1, mean y = 10/3
    //   sxx = (0-1)^2 + 0 + (2-1)^2 = 2
    //   sxy = (-1)(1-10/3) + 0 + (1)(5-10/3) = 7/3 + 5/3 = 4
    //   slope = 4/2 = 2, intercept = 10/3 - 2 = 4/3
    //   residuals: 1-4/3 = -1/3,  4-10/3 = 2/3,  5-16/3 = -1/3
    //   ssRes = 1/9 + 4/9 + 1/9 = 6/9 = 2/3
    //   dof = 1, so the standard error is sqrt(2/3) = 0.8165
    const fit = standardCurve([{ x: 0, y: 1 }, { x: 1, y: 4 }, { x: 2, y: 5 }]);
    expect(fit.slope).toBeCloseTo(2, 10);
    expect(fit.intercept).toBeCloseTo(4 / 3, 10);
    expect(fit.standardError).toBeCloseTo(Math.sqrt(2 / 3), 6);
  });

  it('should report the standard error of the slope', () => {
    // Same hand computation: sqrt((ssRes/dof)/sxx) = sqrt((2/3)/2) = 0.5774.
    const fit = standardCurve([{ x: 0, y: 1 }, { x: 1, y: 4 }, { x: 2, y: 5 }]);
    expect(fit.slopeStdError).toBeCloseTo(Math.sqrt((2 / 3) / 2), 6);
  });

  it('should give a larger slope error for noisier data', () => {
    // The whole point of the statistic: the same x values with more scatter
    // must produce a less certain slope, or it is not measuring anything.
    const clean = standardCurve([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]);
    const noisy = standardCurve([{ x: 0, y: 0.3 }, { x: 1, y: 0.6 }, { x: 2, y: 2.4 }, { x: 3, y: 3.2 }]);
    expect(noisy.slopeStdError).toBeGreaterThan(clean.slopeStdError);
    expect(noisy.standardError).toBeGreaterThan(clean.standardError);
  });

  it('should not divide by zero when only the minimum three points are given', () => {
    // dof = n - 2 = 1 here, the smallest that supports an error estimate.
    const fit = standardCurve([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]);
    expect(Number.isFinite(fit.standardError)).toBe(true);
    expect(Number.isFinite(fit.slopeStdError)).toBe(true);
  });

  it('should report zero error rather than NaN for a perfect fit', () => {
    // A calibration that is too good to be true (a simulation, or a typo)
    // should read as zero error, not as an undefined number.
    const fit = standardCurve([{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 4 }]);
    expect(fit.standardError).toBe(0);
    expect(fit.slopeStdError).toBe(0);
  });

  it('should keep every statistic finite for a flat set of standards', () => {
    // All the same y: R² is reported as 0 rather than 1 (see the note in the
    // implementation), and the errors must not become NaN.
    const fit = standardCurve([{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }]);
    expect(fit.slope).toBeCloseTo(0, 10);
    expect(fit.r2).toBe(0);
    expect(Number.isFinite(fit.standardError)).toBe(true);
    expect(Number.isFinite(fit.slopeStdError)).toBe(true);
  });

  it('should carry the residual count that matches the point count', () => {
    for (const n of [3, 4, 5, 8]) {
      const pts = Array.from({ length: n }, (_, i) => ({ x: i, y: i * 2 + (i % 2) * 0.1 }));
      expect(standardCurve(pts).residuals).toHaveLength(n);
    }
  });
});
