/**
 * Probability distributions: the quantiles and tail probabilities the
 * statistics in this app are built from.
 *
 * Split out of `stats.mjs` when `analytical.mjs` needed the same t quantile for
 * its recovery-bias test. Duplicating the continued fraction and the gamma
 * function there would have meant two copies of a numerical routine that is
 * easy to get subtly wrong and hard to notice when it is — the two would have
 * agreed until one was fixed.
 *
 * ## Why bisection rather than a fitted approximation
 *
 * The usual shortcut for the t quantile is Hill's rational approximation from
 * Numerical Recipes. It is compact, and it is inaccurate in exactly the range
 * this app uses: at df = 4 it returns 2.7642 against a published 2.776, and at
 * df = 1 it fails outright, because its `1/(df − 0.5)` term raises 2 to a power
 * that overflows. Both were measured, not guessed — the first version of this
 * code used it and the tests caught both.
 *
 * Bisection on the CDF has neither failure mode. It costs a couple of hundred
 * evaluations of a continued fraction, which is well under a millisecond, and
 * it agrees with a textbook table to more places than the table prints.
 *
 * Pure functions, no I/O — errors are codes (see errors.mjs).
 */
import { fail, requireFinite } from './errors.mjs';

/**
 * Student t quantile — the inverse of the t CDF.
 *
 * For T ~ t(ν) the two-sided tail is
 *
 *   P(|T| > t) = I_{ν/(ν+t²)}(ν/2, 1/2)
 *
 * with I the regularised incomplete beta. That tail is strictly decreasing in
 * t, so bisection converges without needing a derivative.
 */
export function tQuantile(p, df) {
  requireFinite(p, 'probability');
  if (!(p > 0 && p < 1)) fail('statsBadProbability', { p });
  if (!Number.isFinite(df) || df < 1) {
    fail('mustBePositive', { name: 'degreesOfFreedom', value: df });
  }
  if (p === 0.5) return 0;
  // Symmetry: only the upper half needs inverting.
  if (p < 0.5) return -tQuantile(1 - p, df);

  // The two-sided tail probability this quantile corresponds to.
  const twoSided = 2 * (1 - p);

  /*
   * Bracket by doubling. t grows without bound as the tail shrinks but slowly
   * — at df = 1 the 0.999 quantile is 318 — so a few doublings suffice and the
   * loop cannot overshoot into an overflow.
   */
  let lo = 0;
  let hi = 1;
  while (tTwoSidedTail(hi, df) > twoSided) {
    lo = hi;
    hi *= 2;
    if (hi > 1e12) break; // unreachable for any representable p; a guard, not a path
  }

  // 200 halvings passes double precision, so the width test always ends it.
  for (let i = 0; i < 200 && hi - lo > 1e-12 * Math.max(1, lo); i++) {
    const mid = (lo + hi) / 2;
    if (tTwoSidedTail(mid, df) > twoSided) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** P(|T| > t) for T ~ t(df), the two-sided tail of the t distribution. */
function tTwoSidedTail(t, df) {
  if (t <= 0) return 1;
  return incompleteBeta(df / (df + t * t), df / 2, 0.5);
}

/**
 * The regularised incomplete beta I_x(a, b).
 *
 * The continued fraction converges quickly only for x below the threshold, so
 * above it the symmetry I_x(a,b) = 1 − I_{1−x}(b,a) reflects the problem into
 * the fast region. The reflection is a single branch rather than a recursive
 * call: the reflected arguments always land in the fast branch, so recursing
 * would only ever go one level deep while making that depth non-obvious.
 */
function incompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const fast = x < (a + 1) / (a + b + 2);
  const xx = fast ? x : 1 - x;
  const aa = fast ? a : b;
  const bb = fast ? b : a;

  const lnFront = lnGamma(aa + bb) - lnGamma(aa) - lnGamma(bb)
    + aa * Math.log(xx) + bb * Math.log(1 - xx);
  const value = Math.exp(lnFront) * betaContinuedFraction(xx, aa, bb) / aa;
  return fast ? value : 1 - value;
}

/** Lentz's method for the beta continued fraction. */
function betaContinuedFraction(x, a, b) {
  const TINY = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    // Converged once the correction is below the precision worth carrying.
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return h;
}

/** Lanczos approximation of ln Γ(x), for x > 0. */
function lnGamma(x) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += g[j] / y;
  }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

/**
 * Upper-tail probability of the F distribution, P(F ≥ f).
 *
 *   P(F ≥ f) = I_{df2/(df2 + df1·f)}(df2/2, df1/2)
 */
export function fUpperTail(f, df1, df2) {
  if (!(f > 0)) return 1;
  const x = df2 / (df2 + df1 * f);
  return incompleteBeta(x, df2 / 2, df1 / 2);
}
