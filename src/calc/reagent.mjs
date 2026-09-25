/**
 * Reagent handling, concentration conversions, and spectroscopy.
 *
 * Three groups, each filling a gap the existing calculators left:
 *
 *   1. Concentrated reagents are sold by weight percent, not molarity, but
 *      every dilution calculation needs molarity. Converting is the step people
 *      get wrong most often, because it needs the density that is printed on
 *      the bottle but easy to overlook.
 *   2. Concentration has more than one unit (molarity, molality, mole fraction,
 *      normality), and assay protocols mix them freely.
 *   3. Absorbance and standard curves are the routine math of any wet-lab
 *      quantification, and doing the regression by hand invites arithmetic slips.
 *
 * Pure functions, no I/O, no i18n — errors are codes (see errors.mjs).
 */
import { molarMass } from './solution.mjs';
import { fail, requirePositive, requireNonNegative, requireFinite } from './errors.mjs';

/**
 * Molarity of a concentrated reagent from its weight percentage and density.
 *
 *   C = 1000 · ρ · (pct/100) / M
 *
 * The density is the whole point: 37% HCl is 12 M, not 10 M, and the gap is
 * exactly the kind of thing that silently makes a buffer 20% too strong.
 */
export function molarityFromPercent({ percent, density, formula }) {
  requireFinite(percent, 'percent');
  requirePositive(density, 'density');
  if (percent < 0 || percent > 100) {
    fail('percentOutOfRange', { percent });
  }
  const M = molarMass(formula);
  const gramsPerL = 1000 * density * (percent / 100);
  return { molarity: gramsPerL / M, gramsPerL, molarMass: M };
}

/** How much concentrated reagent to measure out to reach a target molarity. */
export function volumeForMolarity({ percent, density, formula, targetMolarity, targetVolumeMl }) {
  requireNonNegative(targetMolarity, 'molarity');
  requirePositive(targetVolumeMl, 'volume');
  const stock = molarityFromPercent({ percent, density, formula });
  if (targetMolarity > stock.molarity) {
    // Same rule as dilution: you cannot concentrate by taking less of a weaker
    // stock. Returning a number here would have the user measure out a volume
    // that cannot reach the target.
    fail('diluteUp', { target: targetMolarity, stock: Number(stock.molarity.toFixed(3)) });
  }
  const volumeMl = (targetMolarity * targetVolumeMl) / stock.molarity;
  return { volumeMl, stockMolarity: stock.molarity, gramsPerL: stock.gramsPerL };
}

/** Equivalent weight = molar mass ÷ number of reactive equivalents. */
export function equivalentWeight({ formula, n }) {
  if (!Number.isInteger(n) || n <= 0) {
    fail('mustBePositive', { name: 'equivalents', value: n });
  }
  return molarMass(formula) / n;
}

/** Normality = molarity × equivalents per mole. */
export function normality({ molarity, n }) {
  requireNonNegative(molarity, 'molarity');
  if (!Number.isInteger(n) || n <= 0) {
    fail('mustBePositive', { name: 'equivalents', value: n });
  }
  return molarity * n;
}

/** Molality = moles of solute per kilogram of SOLVENT (not of solution). */
export function molality({ molesSolute, solventKg }) {
  requireNonNegative(molesSolute, 'moles');
  requirePositive(solventKg, 'solventMass');
  return molesSolute / solventKg;
}

export function moleFraction({ molesSolute, molesSolvent }) {
  requireNonNegative(molesSolute, 'moles');
  requireNonNegative(molesSolvent, 'moles');
  const total = molesSolute + molesSolvent;
  if (total <= 0) fail('mustBePositive', { name: 'totalMoles', value: total });
  return molesSolute / total;
}

/**
 * Ionic strength:  I = ½ Σ cᵢzᵢ²
 *
 * The z² term is why a divalent ion matters four times as much as a monovalent
 * one at the same concentration, and why a "physiological" buffer made with
 * calcium is not equivalent to one made with sodium.
 */
export function ionicStrength(ions) {
  if (!Array.isArray(ions)) fail('mustBeFinite', { name: 'ions' });
  let sum = 0;
  for (const ion of ions) {
    const { conc, charge } = ion ?? {};
    requireNonNegative(conc, 'concentration');
    requireFinite(charge, 'charge');
    sum += conc * charge ** 2;
  }
  return 0.5 * sum;
}

/** Debye–Hückel A for water at 25 °C. */
const DH_A = 0.51;
/** The Davies empirical term, which extends validity well past 0.1 M. */
const DAVIES_B = 0.3;

/**
 * Activity coefficient from the Davies equation:
 *
 *   log₁₀γ = −A·z²·( √I/(1+√I) − 0.3·I )
 *
 * This is the number the ideal-solution model silently sets to 1. It is not:
 * at I = 0.1 a singly-charged ion has γ ≈ 0.78, so its effective concentration
 * is 22% below the formal one — enough to shift a buffer's pH by a few tenths.
 *
 * Davies rather than the extended Debye–Hückel because of range: extended DH
 * is only good to about I = 0.1 M, which is BELOW physiological ionic strength
 * (≈ 0.15 M) and below most buffer recipes. Davies holds to roughly I = 0.5 M,
 * covering ordinary bench work. Neither is valid in seawater or in a
 * concentrated salt solution, and this does not pretend otherwise.
 */
export function activityCoefficient({ ionicStrength: I, charge }) {
  requireNonNegative(I, 'ionicStrength');
  if (!Number.isInteger(charge)) {
    fail('chargeNotInteger', { charge });
  }
  if (I === 0) return 1;
  const sqrtI = Math.sqrt(I);
  return 10 ** (-DH_A * charge ** 2 * (sqrtI / (1 + sqrtI) - DAVIES_B * I));
}

/**
 * Ionic strength past which the Davies fit is extrapolating, not fitting.
 *
 * The equation has a minimum near I ≈ 0.5 and then rises without bound: at
 * I = 1.95 a singly-charged ion reaches γ = 1, and at I = 5 it reaches 2.59.
 * An activity coefficient above 1 says the ion behaves as if it were MORE
 * concentrated than it is, which the model has no basis to claim — that is the
 * fitted term extrapolating, not chemistry.
 *
 * Kept as a separate predicate rather than folded into `activityCoefficient`'s
 * return value, because that function returns a plain number at three call
 * sites and five tests. A caller that wants the number gets the number; one
 * that wants to know whether to trust it asks. Silently returning 2.59 for a
 * figure the user reads as a correction factor is the failure this guards.
 */
export const DAVIES_I_MAX = 0.5;

/** Whether an ionic strength is inside the range the Davies fit covers. */
export const withinDaviesRange = (I) => Number.isFinite(I) && I <= DAVIES_I_MAX;

/** Absorbance above which the linear relationship stops holding in practice. */
export const LINEAR_ABSORBANCE_MAX = 1.5;

/**
 * Beer–Lambert:  A = ε·c·l
 *
 * Pass any two of (conc, absorbance) and it solves for the third. Above about
 * 1.5 AU the linear relationship degrades in real instruments, so a
 * concentration read from a high absorbance is unreliable — flagged rather
 * than returned silently.
 */
export function beerLambert({ epsilon, conc, absorbance, pathCm = 1 }) {
  requirePositive(epsilon, 'epsilon');
  requirePositive(pathCm, 'pathLength');
  const haveConc = conc !== undefined && conc !== null;
  const haveAbs = absorbance !== undefined && absorbance !== null;
  if (haveConc === haveAbs) {
    fail('beerLambertNeedsOne', {});
  }

  if (haveConc) {
    requireNonNegative(conc, 'concentration');
    const a = epsilon * conc * pathCm;
    return {
      absorbance: a,
      conc,
      linearityWarning: a > LINEAR_ABSORBANCE_MAX
        ? { code: 'absorbanceTooHigh', params: { absorbance: Number(a.toFixed(3)), max: LINEAR_ABSORBANCE_MAX } }
        : null,
    };
  }

  requireNonNegative(absorbance, 'absorbance');
  return {
    conc: absorbance / (epsilon * pathCm),
    absorbance,
    linearityWarning: absorbance > LINEAR_ABSORBANCE_MAX
      ? { code: 'absorbanceTooHigh', params: { absorbance, max: LINEAR_ABSORBANCE_MAX } }
      : null,
  };
}

/**
 * Least-squares fit of a standard curve.
 *
 * Returns the range of the standards alongside the fit, because the most common
 * error with a calibration curve is not a bad fit — it is reading a sample that
 * sits outside the range the curve was built from, where the line no longer
 * means anything.
 */
export function standardCurve(points) {
  if (!Array.isArray(points) || points.length < 3) {
    fail('curveTooFewPoints', { n: Array.isArray(points) ? points.length : 0 });
  }
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  for (const v of [...xs, ...ys]) requireFinite(v, 'point');

  const n = points.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - meanX) ** 2;
    sxy += (xs[i] - meanX) * (ys[i] - meanY);
  }
  if (sxx === 0) fail('curveNoXVariance', {});

  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;

  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (ys[i] - meanY) ** 2;
    ssRes += (ys[i] - (slope * xs[i] + intercept)) ** 2;
  }
  // A perfectly flat set of standards has no variance to explain; calling that
  // R² = 1 would be generous, so report 0.
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  /*
   * Residuals, and the standard error of the fit.
   *
   * R² alone cannot tell a good calibration from a bad one: it says how much of
   * the variance the line explains, not whether the points actually lie on it.
   * A curve whose standards are spread widely enough scores R² > 0.99 while
   * being visibly curved, because the residuals are small next to the spread.
   *
   * The residuals are what a scientist plots to check that assumption, and the
   * standard error is what turns the fitted slope into a number with an
   * uncertainty attached. Both are returned rather than left to the caller to
   * recompute from the same inputs.
   *
   * `standardError` is the residual standard deviation in the y units — an
   * absorbance, for a Beer's law curve — and is the honest answer to "how far
   * off is a single reading".
   */
  const residuals = xs.map((x, i) => ys[i] - (slope * xs[i] + intercept));

  // Two degrees of freedom are spent on the slope and the intercept; with n = 3
  // that leaves one, which is the fewest that gives a meaningful spread.
  const dof = n - 2;
  const standardError = dof > 0 ? Math.sqrt(ssRes / dof) : 0;

  // Standard error of the slope: how well the data pin the gradient down. A
  // slope of 15000 ± 4000 is not the same measurement as 15000 ± 20.
  const slopeStdError = sxx > 0 && dof > 0 ? Math.sqrt((ssRes / dof) / sxx) : 0;

  return {
    slope,
    intercept,
    r2,
    n,
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    residuals,
    standardError,
    slopeStdError,
  };
}

/** Invert a standard curve to read a concentration off a measurement. */
export function predictFromCurve(fit, y) {
  requireFinite(y, 'measurement');
  if (!fit || typeof fit.slope !== 'number') fail('curveInvalid', {});
  if (fit.slope === 0) fail('curveFlatSlope', {});
  const value = (y - fit.intercept) / fit.slope;
  return {
    value,
    outOfRange: value < fit.xMin || value > fit.xMax,
    range: [fit.xMin, fit.xMax],
  };
}
