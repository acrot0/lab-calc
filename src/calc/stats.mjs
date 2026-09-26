/**
 * Experimental statistics: describing data, rejecting outliers, comparing sets.
 *
 * ## Why the outlier tests are here and not left to judgement
 *
 * Every analyst is told to "discard obviously bad data" and almost nobody is
 * told how. Doing it by eye is not a neutral act: with five replicates, one
 * reading that looks wrong is expected to look wrong about a third of the time
 * by chance alone, so discarding it inflates the precision of the remaining
 * four and the reported mean drifts toward whatever the analyst expected.
 *
 * A rejection test replaces the eye with a stated rule, and — more importantly
 * — a stated confidence. Grubbs at 95% discards a point that a well-behaved
 * data set would produce less than 5% of the time. That is a defensible
 * decision to write in a notebook; "it looked wrong" is not.
 *
 * The tests are still a tool, not an oracle. Grubbs assumes the *rest* of the
 * data is roughly normal, and a single grossly wrong point inflates the
 * standard deviation enough to hide itself. So the module returns the statistic
 * and the critical value, not just a verdict, and the UI shows both.
 *
 * ## Why Dixon as well as Grubbs
 *
 * Grubbs is the better test when the data are normal. Dixon's Q is more robust
 * to non-normality and is the one most undergraduate labs actually specify, so
 * refusing to provide it would just push the calculation back onto a
 * hand-worked table. Both are given, with the range of n each is tabulated for.
 *
 * Pure functions, no I/O — errors are codes (see errors.mjs).
 */
import { fail, requireFinite, requirePositive } from './errors.mjs';
import { fUpperTail, tQuantile } from './distributions.mjs';

/*
 * The t and F quantiles live in `distributions.mjs` so the analytical module
 * can share them; re-exported here because this module's callers have always
 * reached for them from here and there is no reason to make them move.
 */
export { tQuantile };

/**
 * Descriptive statistics for a set of replicates.
 *
 * The standard deviation is the *sample* one (n − 1 denominator). The
 * population form is wrong here: these are measurements drawn from a larger
 * population, not the population itself, and using n would understate the
 * spread of every result this app reports.
 */
export function describe(xs) {
  if (!Array.isArray(xs) || xs.length === 0) {
    fail('statsNoData', {});
  }
  for (const x of xs) requireFinite(x, 'value');

  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  // Sorted copy for the median: `sort` mutates, and the caller's array is not
  // this function's to reorder.
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const median = n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  const ss = xs.reduce((acc, x) => acc + (x - mean) ** 2, 0);
  // One measurement has no spread to estimate; reporting 0 would claim it is
  // exact, so the deviation is null and the caller must handle "unknown".
  const sd = n > 1 ? Math.sqrt(ss / (n - 1)) : null;
  const sem = sd === null ? null : sd / Math.sqrt(n);

  return {
    n,
    mean,
    median,
    sd,
    sem,
    min: sorted[0],
    max: sorted[n - 1],
    range: sorted[n - 1] - sorted[0],
    // Sum of squared deviations, returned because every test below needs it and
    // recomputing it from a rounded sd would lose precision.
    ss,
  };
}

/**
 * Relative standard deviation, the figure analytical work actually reports.
 *
 * Returned as a fraction, not a percentage — the caller formats. A null mean
 * gives null rather than Infinity: RSD around zero is meaningless, and a
 * printed "Infinity%" is worse than a dash.
 */
export function rsd(xs) {
  const d = describe(xs);
  if (d.sd === null || d.mean === 0) return null;
  return d.sd / Math.abs(d.mean);
}

/**
 * Grubbs' test for a single outlier.
 *
 *   G = |x_outlier − x̄| / s
 *
 * The largest absolute deviation is the candidate; the question the test
 * answers is whether that deviation is larger than chance would produce. `tail`
 * selects which end is being tested — `two` (the default) for "is any point
 * off", `high` or `low` for a one-sided suspicion, which uses a smaller
 * critical value and so rejects more readily.
 *
 * ## The critical values
 *
 * Computed from the t distribution rather than read from a table:
 *
 *   G_crit = ((n − 1)/√n) · √( t²/(n − 2 + t²) )
 *
 * where t is the two-sided t at the chosen α with n − 2 degrees of freedom.
 * The tabulated Grubbs values in textbooks are this formula evaluated at
 * α = 0.05 and α = 0.01, so computing it agrees with the tables while also
 * working at any n and any α — including the n > 30 cases where the printed
 * tables stop.
 *
 * The t quantiles below are a rational approximation (Hill's, as used in
 * Numerical Recipes), accurate to about four decimal places over the range
 * that matters here. A lookup table was the alternative; it would have needed
 * a row per α and would have had to stop somewhere.
 */
export function grubbs(xs, { alpha = 0.05, tail = 'two' } = {}) {
  const d = describe(xs);
  if (d.n < 3) fail('statsTooFewForOutlier', { n: d.n, min: 3 });
  if (d.sd === 0) {
    // Every reading identical: there is no deviation to test. Returning
    // "no outlier" is right, and dividing by zero is not.
    return { outlier: null, index: -1, G: 0, critical: null, isOutlier: false, ...d };
  }

  const deviations = xs.map((x) => Math.abs(x - d.mean));
  const index = deviations.indexOf(Math.max(...deviations));
  const G = deviations[index] / d.sd;

  /*
   * The t quantile the critical value is built from.
   *
   * A two-sided Grubbs test looks at both extremes, so its α is split across
   * the 2n tails and the quantile is at 1 − α/(2n). A one-sided test only ever
   * examines one end, so the same α is divided by n alone and the quantile is
   * smaller — which is what makes a one-sided test reject more readily.
   */
  const df = d.n - 2;
  const p = tail === 'two' ? 1 - alpha / (2 * d.n) : 1 - alpha / d.n;
  const t = tQuantile(p, df);
  const critical = ((d.n - 1) / Math.sqrt(d.n)) * Math.sqrt((t * t) / (df + t * t));

  return {
    ...d,
    index,
    value: xs[index],
    G,
    critical,
    alpha,
    tail,
    isOutlier: G > critical,
  };
}

/**
 * Dixon's Q test for a single outlier in a small sample.
 *
 * The ratio of the gap to the spread. Which gap depends on n, because the
 * tabulated critical values were derived for different ratios at different
 * sample sizes — the `r10` form (gap over full range) for n = 3–7, and the
 * `r11` form (gap over range excluding the other extreme) beyond, which is less
 * sensitive to the far end of the data.
 *
 * n is capped at 10: beyond that the tabulated Q values converge and Grubbs is
 * the better test, so returning a number here would imply a precision the
 * method does not have.
 */
export function dixon(xs, { alpha = 0.05, tail = 'two' } = {}) {
  const d = describe(xs);
  if (d.n < 3) fail('statsTooFewForOutlier', { n: d.n, min: 3 });
  if (d.n > 10) fail('statsTooManyForDixon', { n: d.n, max: 10 });

  const sorted = [...xs].sort((a, b) => a - b);
  const n = d.n;
  const range = sorted[n - 1] - sorted[0];
  if (range === 0) {
    return { ...d, Q: 0, critical: dixonCritical(n, alpha), isOutlier: false, end: null, tail };
  }

  // Which end is suspected: the one with the larger gap to its neighbour.
  const gapLow = sorted[1] - sorted[0];
  const gapHigh = sorted[n - 1] - sorted[n - 2];
  const end = gapHigh > gapLow ? 'high' : 'low';

  /*
   * r10 for n ≤ 7, r11 above. The denominator for r11 excludes the opposite
   * extreme, which is what makes it robust when the far end is also a bit odd.
   */
  let Q;
  if (n <= 7) {
    Q = (end === 'high' ? gapHigh : gapLow) / range;
  } else {
    const denominator = end === 'high'
      ? sorted[n - 1] - sorted[1]
      : sorted[n - 2] - sorted[0];
    Q = (end === 'high' ? gapHigh : gapLow) / denominator;
  }

  const critical = dixonCritical(n, alpha, tail);
  return { ...d, Q, critical, alpha, tail, end, isOutlier: Q > critical };
}

/**
 * Tabulated Dixon critical values at α = 0.05 and α = 0.01.
 *
 * These are the published tables (Rorabacher 1991), not a fitted curve — the Q
 * statistic's null distribution has no convenient closed form, and the whole
 * point of offering Dixon is that it matches what a lab manual prints.
 *
 * Two-sided values; the one-sided table is smaller at the same α, so a
 * one-sided test uses the α = 0.10 row of the two-sided table. That identity
 * holds for the published values to the printed precision.
 */
const DIXON_TABLE = {
  3: { 0.05: 0.970, 0.01: 0.994 },
  4: { 0.05: 0.829, 0.01: 0.926 },
  5: { 0.05: 0.710, 0.01: 0.821 },
  6: { 0.05: 0.625, 0.01: 0.740 },
  7: { 0.05: 0.568, 0.01: 0.680 },
  8: { 0.05: 0.526, 0.01: 0.634 },
  9: { 0.05: 0.493, 0.01: 0.598 },
  10: { 0.05: 0.466, 0.01: 0.568 },
};

/** The critical Q for a sample size, α and tail. */
export function dixonCritical(n, alpha = 0.05, tail = 'two') {
  const row = DIXON_TABLE[n];
  if (!row) fail('statsTooManyForDixon', { n, max: 10 });
  /*
   * A one-sided test at α examines one end of the data, so it is the two-sided
   * test at 2α. The published tables only carry 0.05 and 0.01, so a request
   * outside those lands on the nearest tabulated column — the 0.05 column for
   * anything less strict, the 0.01 column otherwise. Interpolating between them
   * would invent a critical value the source tables do not contain.
   */
  const wanted = tail === 'two' ? alpha : alpha * 2;
  if (wanted >= 0.05) return row[0.05];
  if (wanted <= 0.01) return row[0.01];
  return row[0.01];
}

/**
 * Confidence interval for a mean.
 *
 *   x̄ ± t(α/2, n−1) · s/√n
 *
 * The t quantile, not 1.96, because s is estimated from the same small sample.
 * Using 1.96 on five replicates is the most common statistical error in
 * undergraduate lab reports: it claims to know the population standard
 * deviation when the data can only estimate it, and understates the interval by
 * about 30% at n = 5.
 */
export function meanConfidenceInterval(xs, { confidence = 0.95 } = {}) {
  const d = describe(xs);
  if (d.n < 2) fail('statsTooFewForCI', { n: d.n, min: 2 });
  requirePositive(confidence, 'confidence');
  if (confidence >= 1 || confidence <= 0) {
    fail('statsBadConfidence', { confidence });
  }
  const alpha = 1 - confidence;
  const t = tQuantile(1 - alpha / 2, d.n - 1);
  const halfWidth = t * d.sem;
  return {
    ...d,
    confidence,
    t,
    halfWidth,
    low: d.mean - halfWidth,
    high: d.mean + halfWidth,
  };
}

/**
 * F test for the ratio of two variances.
 *
 *   F = s₁²/s₂²
 *
 * Used to decide whether two methods are equally precise before comparing their
 * means — which matters because the ordinary t test assumes equal variances,
 * and applying it to unequal ones is the reason Welch's test exists.
 *
 * The larger variance goes on top by convention, so F ≥ 1 and the test is
 * always one-sided in practice even though the underlying distribution is not.
 */
export function fTest(xs1, xs2, { alpha = 0.05 } = {}) {
  const a = describe(xs1);
  const b = describe(xs2);
  if (a.n < 2 || b.n < 2) fail('statsTooFewForVariance', { n1: a.n, n2: b.n });
  if (a.sd === 0 || b.sd === 0) {
    // A zero variance means the test is degenerate; saying so beats dividing by
    // zero and returning Infinity.
    fail('statsZeroVariance', {});
  }

  const [hi, lo] = a.sd >= b.sd ? [a, b] : [b, a];
  const F = hi.sd ** 2 / lo.sd ** 2;
  const df1 = hi.n - 1;
  const df2 = lo.n - 1;
  const p = fUpperTail(F, df1, df2);
  return {
    F,
    df1,
    df2,
    p,
    alpha,
    // Whether the variances differ at the chosen α. Note the direction: a
    // SMALL p means the ratio is unlikely under equal variances.
    differs: p < alpha,
  };
}

/**
 * Welch's t test for two means that may have unequal variances.
 *
 *   t = (x̄₁ − x̄₂) / √(s₁²/n₁ + s₂²/n₂)
 *
 * Welch rather than Student's pooled form because the pooled version assumes
 * equal variances, and that assumption is rarely checked. When it fails the
 * pooled test is either too conservative or, more often, too liberal — it
 * reports significance that is not there.
 *
 * The degrees of freedom are the Welch–Satterthwaite approximation, which
 * yields a non-integer value. That is correct and not a rounding artefact; the
 * effective df really can be fractional when the two samples differ in size and
 * spread.
 */
export function tTest(xs1, xs2, { alpha = 0.05 } = {}) {
  const a = describe(xs1);
  const b = describe(xs2);
  if (a.n < 2 || b.n < 2) fail('statsTooFewForVariance', { n1: a.n, n2: b.n });

  const varA = a.sd ** 2 / a.n;
  const varB = b.sd ** 2 / b.n;
  const se = Math.sqrt(varA + varB);
  if (se === 0) {
    /*
     * Both samples perfectly constant. If they are also EQUAL there is nothing
     * to test and no sampling error to test it against — that is a refusal.
     * If they differ, the difference is real and infinite t is the honest
     * answer, so the test reports significance directly rather than dividing
     * by zero and returning NaN, which would read as "not significant".
     */
    if (a.mean === b.mean) fail('statsZeroVariance', {});
    return {
      t: a.mean > b.mean ? Infinity : -Infinity,
      df: a.n + b.n - 2,
      alpha,
      critical: 0,
      significant: true,
      mean1: a.mean,
      mean2: b.mean,
      difference: a.mean - b.mean,
      n1: a.n,
      n2: b.n,
    };
  }

  const t = (a.mean - b.mean) / se;
  const df = (varA + varB) ** 2
    / (varA ** 2 / (a.n - 1) + varB ** 2 / (b.n - 1));
  const critical = tQuantile(1 - alpha / 2, df);

  return {
    t,
    df,
    alpha,
    critical,
    // Two-sided: a difference in either direction counts.
    significant: Math.abs(t) > critical,
    mean1: a.mean,
    mean2: b.mean,
    difference: a.mean - b.mean,
    n1: a.n,
    n2: b.n,
  };
}
