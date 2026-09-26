import { describe, expect, it } from 'vitest';
import {
  describe as describeStats, dixon, dixonCritical, fTest, grubbs,
  meanConfidenceInterval, rsd, tQuantile, tTest,
} from '../src/calc/stats.mjs';

/*
 * Every critical value asserted here is a published figure, so these tests
 * catch a wrong distribution as well as wrong arithmetic. A self-consistency
 * check would pass on an implementation that had the t and normal quantiles
 * swapped.
 */

describe('describe', () => {
  it('should compute the sample standard deviation, not the population one', () => {
    // [2,4,4,4,5,5,7,9]: mean 5, SS = 32. Sample sd = √(32/7) = 2.1381,
    // population sd = √(32/8) = 2.0. Using n would understate every result.
    const d = describeStats([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(d.mean).toBeCloseTo(5, 12);
    expect(d.sd).toBeCloseTo(Math.sqrt(32 / 7), 12);
    expect(d.sd).not.toBeCloseTo(2, 6);
  });

  it('should give the median of an even set as the mean of the middle pair', () => {
    expect(describeStats([1, 2, 3, 4]).median).toBeCloseTo(2.5, 12);
  });

  it('should give the median of an odd set as the middle value', () => {
    expect(describeStats([5, 1, 3]).median).toBeCloseTo(3, 12);
  });

  it('should not reorder the caller array', () => {
    // `sort` mutates. A caller that passed its data and then read it back would
    // get a silently reordered array.
    const xs = [5, 1, 3];
    describeStats(xs);
    expect(xs).toEqual([5, 1, 3]);
  });

  it('should report a null deviation for a single measurement', () => {
    // One reading has no spread to estimate. Returning 0 would claim it exact.
    const d = describeStats([42]);
    expect(d.n).toBe(1);
    expect(d.sd).toBeNull();
    expect(d.sem).toBeNull();
  });

  it('should refuse an empty set', () => {
    expect(() => describeStats([])).toThrow();
  });
});

describe('rsd', () => {
  it('should express the spread as a fraction of the mean', () => {
    const d = describeStats([10, 10, 10, 10.4]);
    expect(rsd([10, 10, 10, 10.4])).toBeCloseTo(d.sd / d.mean, 12);
  });

  it('should return null rather than Infinity around a zero mean', () => {
    expect(rsd([-1, 1])).toBeNull();
  });
});

describe('tQuantile', () => {
  it('should match the published two-sided 95% value at 4 degrees of freedom', () => {
    // The textbook t(0.025, 4) = 2.776.
    expect(tQuantile(0.975, 4)).toBeCloseTo(2.776, 2);
  });

  it('should match the published value at 1 degree of freedom', () => {
    // t(0.025, 1) = 12.706 — the heaviest tail, and the hardest case for the
    // approximation.
    expect(tQuantile(0.975, 1)).toBeCloseTo(12.706, 2);
  });

  it('should approach the normal quantile as degrees of freedom grow', () => {
    // t(0.975, ∞) = 1.96, reached to two places by df = 1000.
    expect(tQuantile(0.975, 1000)).toBeCloseTo(1.96, 2);
  });

  it('should be symmetric in the probability', () => {
    expect(tQuantile(0.025, 7)).toBeCloseTo(-tQuantile(0.975, 7), 6);
  });

  it('should refuse a probability outside the open unit interval', () => {
    expect(() => tQuantile(1, 5)).toThrow();
    expect(() => tQuantile(0, 5)).toThrow();
  });
});

describe('grubbs', () => {
  it('should flag a gross outlier', () => {
    // Nine readings near 10 and one at 15. G is far past the critical value.
    const r = grubbs([10.1, 10.2, 9.9, 10.0, 10.3, 9.8, 10.1, 10.2, 9.9, 15.0]);
    expect(r.isOutlier).toBe(true);
    expect(r.value).toBeCloseTo(15, 6);
    expect(r.G).toBeGreaterThan(r.critical);
  });

  it('should not flag a well-behaved set', () => {
    const r = grubbs([10.1, 10.2, 9.9, 10.0, 10.3, 9.8, 10.1, 10.2, 9.9, 10.0]);
    expect(r.isOutlier).toBe(false);
  });

  it('should give a critical value matching the published Grubbs table', () => {
    // The standard table for n = 10 at α = 0.05 (two-sided) is 2.290. Computed
    // here from the t distribution rather than tabulated, so this checks the
    // derivation and not just a stored number.
    const r = grubbs([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r.critical).toBeCloseTo(2.29, 2);
  });

  it('should give the published critical value at n = 5', () => {
    // Table value 1.715.
    const r = grubbs([1, 2, 3, 4, 5]);
    expect(r.critical).toBeCloseTo(1.715, 2);
  });

  it('should use a smaller critical value for a one-sided test', () => {
    // The one-sided test only examines one end, so it rejects more readily.
    const two = grubbs([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { tail: 'two' });
    const one = grubbs([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { tail: 'high' });
    expect(one.critical).toBeLessThan(two.critical);
  });

  it('should return no outlier when every reading is identical', () => {
    // A zero standard deviation would make G a division by zero.
    const r = grubbs([5, 5, 5, 5]);
    expect(r.isOutlier).toBe(false);
    expect(r.G).toBe(0);
  });

  it('should refuse fewer than three points', () => {
    expect(() => grubbs([1, 2])).toThrow();
  });

  it('should be fooled by two gross outliers, and say so by the statistic', () => {
    // This is the documented weakness: two bad points inflate s enough that
    // neither looks extreme. The test asserts the failure mode rather than
    // pretending it does not exist.
    const r = grubbs([10, 10, 10, 10, 10, 10, 50, 60]);
    expect(r.isOutlier).toBe(false);
  });
});

describe('dixonCritical', () => {
  it('should return the published Q for n = 5 at 95%', () => {
    expect(dixonCritical(5, 0.05)).toBeCloseTo(0.710, 3);
  });

  it('should return the published Q for n = 3 at 95%', () => {
    expect(dixonCritical(3, 0.05)).toBeCloseTo(0.970, 3);
  });

  it('should be stricter at 99% than at 95%', () => {
    expect(dixonCritical(6, 0.01)).toBeGreaterThan(dixonCritical(6, 0.05));
  });

  it('should refuse a sample larger than the table covers', () => {
    expect(() => dixonCritical(11)).toThrow();
  });
});

describe('dixon', () => {
  it('should flag an outlier in a small sample', () => {
    const r = dixon([10.0, 10.1, 10.2, 10.1, 15.0]);
    expect(r.isOutlier).toBe(true);
    expect(r.end).toBe('high');
  });

  it('should flag an outlier at the low end and name that end', () => {
    const r = dixon([5.0, 10.0, 10.1, 10.2, 10.1]);
    expect(r.isOutlier).toBe(true);
    expect(r.end).toBe('low');
  });

  it('should not flag a well-behaved set', () => {
    expect(dixon([10.0, 10.1, 10.2, 10.1, 10.05]).isOutlier).toBe(false);
  });

  it('should compute Q as the gap over the range for n at or below 7', () => {
    // [1,2,3,4,10]: high gap 6, range 9, Q = 0.6667.
    const r = dixon([1, 2, 3, 4, 10]);
    expect(r.Q).toBeCloseTo(6 / 9, 10);
  });

  it('should compute Q against the trimmed range above n = 7', () => {
    // [1,2,3,4,5,6,7,8,9,20]: high gap 11, denominator 20 − 2 = 18.
    const r = dixon([1, 2, 3, 4, 5, 6, 7, 8, 9, 20]);
    expect(r.Q).toBeCloseTo(11 / 18, 10);
  });

  it('should refuse more than ten points', () => {
    // Beyond ten the tabulated values converge and Grubbs is the right test.
    expect(() => dixon([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])).toThrow();
  });

  it('should return no outlier when the range is zero', () => {
    expect(dixon([7, 7, 7, 7]).isOutlier).toBe(false);
  });
});

describe('meanConfidenceInterval', () => {
  it('should use the t quantile, not 1.96', () => {
    // Five replicates: t(0.025, 4) = 2.776. Using 1.96 would understate the
    // half-width by about 30%, which is the error this test names.
    const xs = [10.0, 10.2, 9.8, 10.1, 9.9];
    const r = meanConfidenceInterval(xs);
    expect(r.t).toBeCloseTo(2.776, 2);
    const naive = 1.96 * r.sem;
    expect(r.halfWidth).toBeGreaterThan(naive * 1.3);
  });

  it('should bracket the mean', () => {
    const r = meanConfidenceInterval([10.0, 10.2, 9.8, 10.1, 9.9]);
    expect(r.low).toBeLessThan(r.mean);
    expect(r.high).toBeGreaterThan(r.mean);
    expect(r.low).toBeCloseTo(r.mean - r.halfWidth, 12);
  });

  it('should widen at 99% compared with 95%', () => {
    const xs = [10.0, 10.2, 9.8, 10.1, 9.9];
    const lo = meanConfidenceInterval(xs, { confidence: 0.95 });
    const hi = meanConfidenceInterval(xs, { confidence: 0.99 });
    expect(hi.halfWidth).toBeGreaterThan(lo.halfWidth);
  });

  it('should refuse a single measurement', () => {
    expect(() => meanConfidenceInterval([5])).toThrow();
  });

  it('should refuse a confidence outside the open unit interval', () => {
    expect(() => meanConfidenceInterval([1, 2], { confidence: 1 })).toThrow();
  });
});

describe('fTest', () => {
  it('should give F = 1 for two samples with the same spread', () => {
    // [1,2,3,4,5] and [11,12,13,14,15] have identical variances.
    const r = fTest([1, 2, 3, 4, 5], [11, 12, 13, 14, 15]);
    expect(r.F).toBeCloseTo(1, 10);
    expect(r.differs).toBe(false);
  });

  it('should put the larger variance on top so F is at least 1', () => {
    const r = fTest([1, 2, 3, 4, 5], [1, 5, 9, 13, 17]);
    expect(r.F).toBeGreaterThan(1);
  });

  it('should detect clearly unequal variances', () => {
    const r = fTest([10.0, 10.01, 10.02, 9.99, 9.98], [1, 5, 9, 13, 17]);
    expect(r.differs).toBe(true);
    expect(r.p).toBeLessThan(0.05);
  });

  it('should give p = 0.5 when the variances are exactly equal', () => {
    // F = 1 sits at the median of the F distribution, not its extreme: half of
    // all F values fall below 1 by construction. A p of 1 here would mean the
    // tail probability had been taken from the wrong side.
    expect(fTest([1, 2, 3, 4, 5], [11, 12, 13, 14, 15]).p).toBeCloseTo(0.5, 6);
  });

  it('should give the published p at the tabulated critical F', () => {
    /*
     * F(0.05, 4, 4) = 6.3882. Feeding that ratio in must return p = 0.05 —
     * which checks the incomplete beta against a table value rather than
     * against itself.
     *
     * The ratio is built from sample standard deviations directly: two sets
     * with s₁/s₂ = √6.3882. [1,2,3,4,5] has s² = 2.5, so s = 1.5811.
     */
    const target = Math.sqrt(6.3882);
    const sd1 = 1;
    const sd2 = sd1 / target;
    const a = [0, sd1, -sd1, sd1, -sd1];
    const b = [0, sd2, -sd2, sd2, -sd2];
    const r = fTest(a, b);
    expect(r.F).toBeCloseTo(6.3882, 3);
    expect(r.p).toBeCloseTo(0.05, 3);
  });

  it('should refuse a sample with no variance', () => {
    // Degenerate: the ratio is either 0 or undefined, and neither is a test.
    expect(() => fTest([5, 5, 5], [1, 2, 3])).toThrow();
  });
});

describe('tTest', () => {
  it('should find no significant difference between two similar sets', () => {
    const r = tTest([10.0, 10.2, 9.8, 10.1, 9.9], [10.1, 9.9, 10.0, 10.2, 9.8]);
    expect(r.significant).toBe(false);
    expect(Math.abs(r.t)).toBeLessThan(r.critical);
  });

  it('should find a significant difference between well-separated sets', () => {
    // The spreads are tight enough that a 1-unit shift is unambiguous.
    const r = tTest([10.0, 10.02, 9.98, 10.01, 9.99], [11.0, 11.02, 10.98, 11.01, 10.99]);
    expect(r.significant).toBe(true);
    expect(r.difference).toBeCloseTo(-1, 2);
  });

  it('should give Welch degrees of freedom, which need not be a whole number', () => {
    // Unequal sizes and spreads produce a fractional df. Rounding it to an
    // integer would silently change the critical value.
    const r = tTest([1, 2, 3], [10, 20, 30, 40, 50, 60, 70]);
    expect(Number.isInteger(r.df)).toBe(false);
    expect(r.df).toBeGreaterThan(0);
  });

  it('should reduce to the pooled test when the samples match in size and spread', () => {
    // With n1 = n2 and s1 = s2, Welch and pooled agree exactly.
    const r = tTest([1, 2, 3, 4, 5], [3, 4, 5, 6, 7]);
    expect(r.df).toBeCloseTo(8, 6);
  });

  it('should refuse two identical constant samples, where there is nothing to test', () => {
    expect(() => tTest([5, 5, 5], [5, 5, 5])).toThrow();
  });

  it('should report significance when two constant samples differ', () => {
    // No sampling error at all and a real difference: t is infinite, which is
    // the honest answer. Dividing by a zero standard error would give NaN and
    // a silent "not significant".
    const r = tTest([5, 5, 5], [6, 6, 6]);
    expect(r.significant).toBe(true);
    expect(r.difference).toBeCloseTo(-1, 12);
  });
});
