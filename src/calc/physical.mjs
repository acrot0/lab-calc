/**
 * Physical chemistry: kinetics, conductivity, thermodynamics, phase behaviour.
 *
 * ## What this adds
 *
 * The app already models equilibria — pH, buffers, titration curves, activity
 * coefficients. Those all describe where a system ends up. Nothing here
 * described how fast it gets there, how well a solution conducts on the way, or
 * whether a reaction is worth attempting at all. Those are the four groups
 * below.
 *
 * Each carries a trap that a hand calculation walks into:
 *
 *   1. **Kinetics.** A first-order half-life does not depend on concentration,
 *      a second-order one does. Using the wrong order's formula gives an answer
 *      that is dimensionally fine and wrong by whatever factor the
 *      concentration happens to be. The order is fitted, not assumed, and the
 *      fit quality is reported so a wrong order is visible rather than hidden.
 *
 *   2. **Arrhenius.** The activation energy comes from the slope of ln k
 *      against 1/T, so it is only as good as the temperature range the data
 *      span. Two points measured 5 °C apart give a number with an uncertainty
 *      of tens of kJ/mol, and it will still look authoritative.
 *
 *   3. **Conductivity.** Molar conductivity falls with concentration even for a
 *      strong electrolyte, because interionic attraction slows the ions down.
 *      Extrapolating to zero concentration to get the limiting value — and from
 *      it the degree of dissociation of a weak acid — is the whole method, and
 *      it needs the extrapolation done rather than a single reading used.
 *
 *   4. **Thermodynamics.** ΔG = ΔH − TΔS, and the sign of ΔG decides
 *      spontaneity. But ΔH and ΔS are themselves temperature-dependent, so a
 *      reaction that is spontaneous at 25 °C can stop being so at 80 °C. The
 *      crossover temperature is the number worth knowing and the one usually
 *      left uncomputed.
 *
 * Pure functions, no I/O — errors are codes (see errors.mjs).
 */
import { fail, requirePositive, requireNonNegative, requireFinite } from './errors.mjs';
import { tQuantile } from './distributions.mjs';

/** The gas constant, J/(mol·K). */
export const R_GAS = 8.314462618;

/** The gas constant in kJ/(mol·K), which is what thermodynamic data uses. */
export const R_KJ = R_GAS / 1000;

/** Standard temperature, 298.15 K. */
const T_STANDARD = 298.15;

/**
 * Fit a reaction order from concentration–time data.
 *
 * ## How the order is chosen
 *
 * Not by assuming one. Each candidate order has a linearised form:
 *
 *   zero:       [A] against t
 *   first:      ln[A] against t
 *   second:     1/[A] against t
 *
 * The order whose plot is actually straight is the order of the reaction, so
 * all three are fitted and the one with the best correlation wins. Reporting
 * only the winner would hide the case where none of them is straight, which
 * happens whenever the data are bad or the reaction has mixed order — so every
 * fit is returned with its R².
 *
 * ## Why the R² comparison is not enough on its own
 *
 * R² measures how much of the variance a line explains, not whether the
 * relationship is linear. Data spanning a wide concentration range scores
 * above 0.99 on the wrong order too, because the curvature is small next to
 * the spread. `residualPattern` therefore reports whether the residuals are
 * systematically curved, which is the check that actually distinguishes them.
 */
export function fitOrder(points) {
  if (!Array.isArray(points) || points.length < 3) {
    fail('curveTooFewPoints', { n: Array.isArray(points) ? points.length : 0 });
  }
  const times = points.map((p) => p.t);
  const concs = points.map((p) => p.c);
  for (const v of [...times, ...concs]) requireFinite(v, 'point');
  for (const c of concs) requirePositive(c, 'concentration');

  const fits = {
    zero: linearFit(times, concs),
    first: linearFit(times, concs.map((c) => Math.log(c))),
    second: linearFit(times, concs.map((c) => 1 / c)),
  };

  // Best R² wins. A tie is impossible in practice but the order of the keys
  // makes the outcome deterministic if it happens.
  let best = 'first';
  for (const key of ['zero', 'first', 'second']) {
    if (fits[key].r2 > fits[best].r2) best = key;
  }

  const order = { zero: 0, first: 1, second: 2 }[best];
  const chosen = fits[best];

  /*
   * The rate constant is read off the fitted slope with the sign convention
   * that k is positive for a reaction that consumes A. The linearised forms
   * all have negative slope for a decaying concentration, so k is the
   * magnitude — except for zero order, where the slope IS -k directly.
   */
  const k = Math.abs(chosen.slope);

  return {
    order,
    k,
    r2: chosen.r2,
    fits,
    intercept: chosen.intercept,
    // Whether any candidate fit is actually straight, which is the question
    // the order selection silently assumes the answer to.
    reliable: chosen.r2 >= 0.99,
    residualPattern: residualPattern(times, concs, best),
  };
}

/**
 * Predict the concentration remaining after a time, given a fitted order.
 *
 * Each order has its own integrated rate law, and they are not
 * interchangeable:
 *
 *   zero:    [A] = [A]₀ − kt
 *   first:   [A] = [A]₀·e^(−kt)
 *   second:  1/[A] = 1/[A]₀ + kt
 *
 * The first-order case is the one with the useful property: the half-life is
 * ln2/k regardless of starting concentration. For every other order the
 * half-life depends on [A]₀, which is why the two must not be confused.
 */
export function concentrationAt({ order, k, initial, time }) {
  requireNonNegative(k, 'k');
  requirePositive(initial, 'initialConcentration');
  requireNonNegative(time, 'time');
  if (![0, 1, 2].includes(order)) fail('kineticsOrderUnsupported', { order });

  if (order === 0) {
    // A zero-order reaction cannot go below zero: the rate law stops applying
    // once the reactant is gone, and returning a negative concentration would
    // be a number with no physical meaning.
    return { conc: Math.max(0, initial - k * time), exhausted: k * time >= initial };
  }
  if (order === 1) {
    return { conc: initial * Math.exp(-k * time), exhausted: false };
  }
  const inv = 1 / initial + k * time;
  return { conc: 1 / inv, exhausted: false };
}

/** Half-life for a fitted order, which depends on the order and on [A]₀. */
export function halfLife({ order, k, initial }) {
  requirePositive(k, 'k');
  requirePositive(initial, 'initialConcentration');
  if (order === 0) return initial / (2 * k);
  if (order === 1) return Math.LN2 / k;
  if (order === 2) return 1 / (k * initial);
  fail('kineticsOrderUnsupported', { order });
}

/**
 * Arrhenius analysis: activation energy from rate constants at several
 * temperatures.
 *
 *   ln k = ln A − (Ea/R)·(1/T)
 *
 * A straight line in 1/T, so Ea comes from the slope and the pre-exponential
 * factor A from the intercept. The sign is the thing to get right: the slope
 * is negative, and Ea = −slope·R is positive for every ordinary reaction.
 *
 * ## The uncertainty is the point
 *
 * Ea is an extrapolation from the temperature range the data cover, and it is
 * far more sensitive to that range than the numbers suggest. Two rate constants
 * measured 10 °C apart give an Ea whose confidence interval spans tens of
 * kJ/mol; the same measurement over 40 °C pins it to a few. Both produce a
 * plausible-looking number, so the interval is returned and the temperature
 * span is reported alongside it.
 */
export function arrhenius(points, { confidence = 0.95 } = {}) {
  if (!Array.isArray(points) || points.length < 3) {
    fail('arrheniusTooFewPoints', { n: Array.isArray(points) ? points.length : 0 });
  }

  // Temperatures arrive in Celsius because that is what a thermostat reads.
  const invT = points.map((p) => {
    requireFinite(p.tempC, 'temperature');
    const kelvin = p.tempC + 273.15;
    if (kelvin <= 0) fail('temperatureBelowAbsoluteZero', { tempC: p.tempC });
    return 1 / kelvin;
  });
  const lnK = points.map((p) => {
    requirePositive(p.k, 'rateConstant');
    return Math.log(p.k);
  });

  const fit = linearFit(invT, lnK);
  const slope = fit.slope;
  const Ea = -slope * R_GAS; // J/mol
  const lnA = fit.intercept;
  const A = Math.exp(lnA);

  /*
   * The confidence interval on the slope, propagated to Ea.
   *
   * The slope's standard error is the residual scatter divided by the spread
   * in 1/T. That denominator is what makes a narrow temperature range so
   * damaging: the spread in 1/T over 10 °C near room temperature is about
   * 1e-4, and over 40 °C about 4e-4, so the same scatter gives a slope error
   * four times larger from the narrow range.
   */
  const n = points.length;
  const dof = n - 2;
  const meanX = invT.reduce((a, b) => a + b, 0) / n;
  const sxx = invT.reduce((acc, x) => acc + (x - meanX) ** 2, 0);
  const ssRes = invT.reduce(
    (acc, x, i) => acc + (lnK[i] - (slope * x + fit.intercept)) ** 2, 0,
  );
  const slopeStdError = dof > 0 && sxx > 0 ? Math.sqrt(ssRes / dof / sxx) : null;
  const tCrit = dof > 0 ? tQuantile(1 - (1 - confidence) / 2, dof) : null;
  const eaUncertainty = slopeStdError !== null && tCrit !== null
    ? slopeStdError * R_GAS * tCrit
    : null;

  const temps = points.map((p) => p.tempC);
  return {
    Ea,
    EaKJ: Ea / 1000,
    // Half-width of the confidence interval, in kJ/mol. Null when there are
    // too few points to estimate the scatter.
    EaUncertaintyKJ: eaUncertainty === null ? null : eaUncertainty / 1000,
    A,
    lnA,
    slope,
    r2: fit.r2,
    n,
    confidence,
    tempRangeC: [Math.min(...temps), Math.max(...temps)],
    tempSpanC: Math.max(...temps) - Math.min(...temps),
    /*
     * Whether the temperature range is wide enough for the interval to mean
     * anything. Below about 20 °C the extrapolation to Ea is dominated by
     * scatter, and the reported uncertainty will say so — this is the flag for
     * a caller that wants to warn before showing a number at all.
     */
    rangeAdequate: Math.max(...temps) - Math.min(...temps) >= 20,
  };
}

/**
 * Molar conductivity of a solution.
 *
 *   Λm = κ / c
 *
 * with κ in S/cm and c in mol/L, giving S·cm²/mol. The unit conversion is the
 * whole difficulty: conductivity is reported in S/cm or mS/cm, concentration in
 * mol/L or mmol/L, and the factors of 1000 are where the errors live. The
 * function takes κ in mS/cm and c in mol/L — the units a bench meter and a
 * volumetric calculation actually produce — and does the conversion once.
 */
export function molarConductivity({ conductivityMsPerCm, concMolPerL }) {
  requirePositive(conductivityMsPerCm, 'conductivity');
  requirePositive(concMolPerL, 'concentration');
  // mS/cm -> S/cm is 1e-3; S/cm per mol/L is S·cm²/mol after dividing by the
  // concentration and multiplying by the 1000 cm³ in a litre.
  const kappaSPerCm = conductivityMsPerCm / 1000;
  return {
    lambda: (kappaSPerCm / concMolPerL) * 1000,
    kappaSPerCm,
  };
}

/**
 * Limiting molar conductivity by Kohlrausch extrapolation.
 *
 *   Λm = Λm° − K·√c
 *
 * A straight line in √c, so the intercept is the limiting value at infinite
 * dilution. This is the only way to get Λm° for a weak electrolyte — you cannot
 * measure it directly, because diluting a weak acid also changes how much of it
 * is dissociated.
 */
export function kohlrausch(points) {
  if (!Array.isArray(points) || points.length < 3) {
    fail('curveTooFewPoints', { n: Array.isArray(points) ? points.length : 0 });
  }
  const sqrtC = points.map((p) => {
    requirePositive(p.conc, 'concentration');
    return Math.sqrt(p.conc);
  });
  const lambdas = points.map((p) => {
    requirePositive(p.lambda, 'conductivity');
    return p.lambda;
  });

  const fit = linearFit(sqrtC, lambdas);
  return {
    limiting: fit.intercept,
    slope: fit.slope,
    r2: fit.r2,
    n: points.length,
    // A positive slope would mean conductivity rising with concentration
    // without bound, which no electrolyte does.
    plausible: fit.slope < 0,
  };
}

/**
 * Degree of dissociation of a weak electrolyte from conductivity.
 *
 *   α = Λm / Λm°
 *
 * The ratio of the measured molar conductivity to the limiting one. This is
 * Arrhenius's original method and it still works, provided Λm° came from a
 * Kohlrausch extrapolation of the same salt rather than from a table for a
 * different one.
 */
export function degreeOfDissociation({ lambda, limiting }) {
  requirePositive(lambda, 'molarConductivity');
  requirePositive(limiting, 'limitingConductivity');
  const alpha = lambda / limiting;
  return {
    alpha,
    /*
     * `valid` means "α is physically possible", i.e. not above 1. Above 1 the
     * measurement contradicts the limiting value, so one of the two is wrong
     * rather than the electrolyte being more than fully dissociated.
     *
     * α = 1 exactly is a different case and is caught by `complete` below, not
     * here: a fully dissociated electrolyte is a real thing, but Ostwald's law
     * divides by (1 − α) and so cannot describe it. Reporting valid: true for
     * α = 1 let the caller go on to divide by zero and surface the failure as
     * an "alpha out of range" error from a different function, which points at
     * the wrong input.
     */
    valid: alpha <= 1,
    // At or above 1 the electrolyte is fully dissociated and Ostwald's law does
    // not apply — a strong acid has no Ka to extract by this method.
    complete: alpha >= 1,
    percent: alpha * 100,
  };
}

/**
 * Ostwald's dilution law: the dissociation constant from α and c.
 *
 *   Ka = c·α² / (1 − α)
 *
 * This is what makes a conductivity measurement into a pKa, and it is why the
 * method works at all: α comes from a conductivity ratio, so a single
 * conductivity reading plus a limiting value gives the equilibrium constant
 * without any titration.
 */
export function ostwaldDilutionLaw({ alpha, conc }) {
  requireFinite(alpha, 'alpha');
  requirePositive(conc, 'concentration');
  if (!(alpha > 0 && alpha < 1)) fail('alphaOutOfRange', { alpha });
  const Ka = conc * alpha ** 2 / (1 - alpha);
  return { Ka, pKa: -Math.log10(Ka) };
}

/**
 * Gibbs energy from enthalpy and entropy.
 *
 *   ΔG = ΔH − TΔS
 *
 * ΔH in kJ/mol, ΔS in J/(mol·K) — the units differ by a factor of 1000 and
 * that mismatch is the most common arithmetic error in the whole of
 * thermodynamics. Both are accepted in their conventional units and converted
 * once, here.
 */
export function gibbsEnergy({ deltaH, deltaS, tempC = 25 }) {
  requireFinite(deltaH, 'deltaH');
  requireFinite(deltaS, 'deltaS');
  requireFinite(tempC, 'temperature');
  const kelvin = tempC + 273.15;
  if (kelvin <= 0) fail('temperatureBelowAbsoluteZero', { tempC });
  const entropyTermKJ = (deltaS * kelvin) / 1000;
  const deltaG = deltaH - entropyTermKJ;
  return {
    deltaG,
    deltaH,
    deltaS,
    tempK: kelvin,
    entropyTermKJ,
    spontaneous: deltaG < 0,
    /*
     * How the two terms compare. A reaction driven by enthalpy has |ΔH| much
     * larger than |TΔS|, which means its spontaneity is robust to temperature;
     * one driven by entropy has them comparable, which means a modest
     * temperature change can reverse it.
     */
    driving: Math.abs(deltaH) > Math.abs(entropyTermKJ) ? 'enthalpy' : 'entropy',
  };
}

/**
 * The temperature at which ΔG changes sign.
 *
 *   T_crossover = ΔH / ΔS
 *
 * Only meaningful when ΔH and ΔS have the same sign: then one of them favours
 * the reaction and the other opposes it, and the balance tips at one specific
 * temperature. When they have opposite signs ΔG has the same sign at every
 * temperature and there is no crossover — returning a number there would invent
 * a transition that does not exist.
 *
 * The temperature-independent form is used, which assumes ΔH and ΔS do not
 * themselves vary over the range. That is a real approximation and the reason
 * the result is reported as an estimate.
 */
export function crossoverTemperature({ deltaH, deltaS }) {
  requireFinite(deltaH, 'deltaH');
  requireFinite(deltaS, 'deltaS');
  if (deltaS === 0) fail('crossoverUndefinedEntropy', {});
  const sameSign = (deltaH > 0) === (deltaS > 0);
  const tempK = deltaH / deltaS;
  return {
    tempK,
    tempC: tempK - 273.15,
    exists: sameSign,
    // Below this temperature one sign of ΔG holds, above it the other.
    direction: sameSign
      ? (deltaH > 0 ? 'spontaneousAbove' : 'spontaneousBelow')
      : 'alwaysSame',
  };
}

/**
 * Equilibrium constant from the standard Gibbs energy.
 *
 *   ΔG° = −RT·ln K
 *
 * The exponential is why a small ΔG error becomes a large K error: 5 kJ/mol at
 * room temperature is a factor of about 7.5 in K. A result quoted to two
 * decimal places in kJ/mol implies a K known to about 20%, and the module
 * returns both so the pairing is visible.
 */
export function equilibriumConstant({ deltaG, tempC = 25 }) {
  requireFinite(deltaG, 'deltaG');
  const kelvin = tempC + 273.15;
  if (kelvin <= 0) fail('temperatureBelowAbsoluteZero', { tempC });
  const lnK = -deltaG * 1000 / (R_GAS * kelvin);
  return {
    K: Math.exp(lnK),
    lnK,
    pK: -lnK / Math.LN10,
    tempK: kelvin,
  };
}

/**
 * Phase behaviour of a two-component system, from the two melting points.
 *
 * ## What this models, and what it does not
 *
 * This is the ideal (Schröder–van Laar) model for a simple eutectic: both
 * components are completely miscible as liquids, completely immiscible as
 * solids, and the liquid is an ideal solution. Under those assumptions the
 * liquidus for each component is
 *
 *   ln x = −(ΔH_fus/R)·(1/T − 1/T_m)
 *
 * and the eutectic is where the two curves cross.
 *
 * It is the textbook treatment and it is genuinely predictive for systems like
 * naphthalene–benzene. It is NOT valid for systems with solid solutions, any
 * compound formation, or a liquid that is far from ideal — a eutectic that is
 * supposed to be at 50 mol% but is measured at 20% means one of those applies
 * and the model has no term for it.
 *
 * The eutectic is found by bisection on the difference between the two
 * liquidus temperatures, which is monotonic in the composition for an ideal
 * system.
 */
export function eutectic({ a, b }) {
  const compA = normalizeComponent(a, 'a');
  const compB = normalizeComponent(b, 'b');

  const liquidusT = (x, comp) => {
    if (x <= 0 || x >= 1) return comp.meltingK;
    const lnX = Math.log(x);
    // Invert ln x = -(ΔH/R)(1/T - 1/Tm) for T.
    const invT = 1 / comp.meltingK - (lnX * R_GAS) / comp.fusionJ;
    return 1 / invT;
  };

  // The difference between the two liquidus curves, which changes sign at the
  // eutectic: at x = 0 the A curve is depressed and B is not, and vice versa.
  const difference = (x) => liquidusT(x, compA) - liquidusT(1 - x, compB);

  let lo = 1e-6;
  let hi = 1 - 1e-6;
  const dLo = difference(lo);
  const dHi = difference(hi);
  if (dLo * dHi > 0) {
    // No sign change means the two liquidus curves do not cross inside the
    // composition range — the components are too similar for a eutectic, or
    // the model does not apply. Saying so beats bisecting toward a bound and
    // reporting the edge as an answer.
    return {
      exists: false,
      a: compA,
      b: compB,
      note: 'noCrossover',
    };
  }

  for (let i = 0; i < 200 && hi - lo > 1e-12; i++) {
    const mid = (lo + hi) / 2;
    if (difference(mid) * dLo > 0) lo = mid; else hi = mid;
  }
  const xA = (lo + hi) / 2;
  const tempK = liquidusT(xA, compA);

  return {
    exists: true,
    eutecticTempK: tempK,
    eutecticTempC: tempK - 273.15,
    // Mole fraction of the first component at the eutectic.
    xA,
    xB: 1 - xA,
    a: compA,
    b: compB,
    // The full curves, sampled for a plot. Fifty points is enough to draw a
    // smooth pair of liquidus lines and cheap enough to recompute per render.
    curve: sampleLiquidus(compA, compB, liquidusT, 50),
  };
}

/**
 * Liquidus temperature at a composition, for plotting.
 *
 * Which component's curve applies depends on which side of the eutectic the
 * composition falls: the liquidus is the higher of the two depressed melting
 * points, and the eutectic is where they meet.
 */
export function liquidusAt({ a, b, xA }) {
  const compA = normalizeComponent(a, 'a');
  const compB = normalizeComponent(b, 'b');
  requireFinite(xA, 'moleFraction');
  if (xA < 0 || xA > 1) fail('moleFractionOutOfRange', { xA });

  const tA = liquidusTemperature(xA, compA);
  const tB = liquidusTemperature(1 - xA, compB);
  return {
    tempK: Math.max(tA, tB),
    fromA: tA,
    fromB: tB,
    // The component whose liquidus is higher, which is the one crystallising.
    crystallising: tA >= tB ? compA.label : compB.label,
  };
}

/** Liquidus temperature for one component at a given mole fraction. */
function liquidusTemperature(x, comp) {
  if (x <= 0) return -Infinity;
  if (x >= 1) return comp.meltingK;
  const invT = 1 / comp.meltingK - (Math.log(x) * R_GAS) / comp.fusionJ;
  return 1 / invT;
}

/** Sample both liquidus curves across the composition range, for a plot. */
function sampleLiquidus(compA, compB, liquidusT, count) {
  const points = [];
  for (let i = 0; i <= count; i++) {
    const xA = i / count;
    // At the pure ends one of the two is undefined; the melting point of the
    // pure component stands in, which is what the curve tends to.
    const tA = xA === 0 ? compA.meltingK : liquidusT(xA, compA);
    const tB = xA === 1 ? compB.meltingK : liquidusT(1 - xA, compB);
    points.push({ xA, tA, tB, liquidus: Math.max(tA, tB) });
  }
  return points;
}

/**
 * Validate and normalise a component for the phase calculation.
 *
 * Enthalpy of fusion is accepted in kJ/mol, the unit thermodynamic tables use,
 * and converted to J/mol once so the gas constant stays consistent.
 */
function normalizeComponent(comp, name) {
  if (!comp || typeof comp !== 'object') fail('phaseComponentMissing', { name });
  requireFinite(comp.meltingC, 'meltingPoint');
  const meltingK = comp.meltingC + 273.15;
  if (meltingK <= 0) fail('temperatureBelowAbsoluteZero', { tempC: comp.meltingC });
  requirePositive(comp.fusionKJ, 'enthalpyOfFusion');
  return {
    label: comp.label ?? name,
    meltingK,
    meltingC: comp.meltingC,
    fusionKJ: comp.fusionKJ,
    fusionJ: comp.fusionKJ * 1000,
  };
}

/**
 * Ordinary least squares on two plain arrays.
 *
 * Local rather than imported from `reagent.mjs`, which fits `{x, y}` point
 * objects and returns a different shape. Two small fits is below the threshold
 * where a shared abstraction pays for itself, and the alternative — reshaping
 * every caller's data into one convention — would be more code than this.
 */
function linearFit(xs, ys) {
  const n = xs.length;
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
  return {
    slope,
    intercept,
    r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot,
    residuals: xs.map((x, i) => ys[i] - (slope * x + intercept)),
  };
}

/**
 * Whether a fit's residuals are systematically curved rather than scattered.
 *
 * The runs test, in its simplest form: count how often the residual changes
 * sign between consecutive points. Random residuals change sign about half the
 * time; a curve produces long runs of one sign. With n points there are n − 1
 * transitions, and fewer than about a third of them is the signature of a
 * systematic misfit.
 *
 * This is the check that catches a wrong reaction order when R² does not: a
 * straight line through curved data can still score 0.99.
 */
function residualPattern(xs, ys, order) {
  const transformed = order === 'zero' ? ys
    : order === 'first' ? ys.map((y) => Math.log(y))
      : ys.map((y) => 1 / y);
  const fit = linearFit(xs, transformed);

  /*
   * A perfect fit has no pattern to read. Every residual is zero, so every
   * sign is zero, so the transition count is zero — which the streak test
   * below would otherwise read as the strongest possible evidence of
   * curvature. That is exactly backwards: synthetic data with no noise lands
   * here, and calling it curved would fail the check on the one case where the
   * fit is beyond question.
   */
  const maxResidual = Math.max(...fit.residuals.map((r) => Math.abs(r)));
  const scale = Math.max(...transformed.map((y) => Math.abs(y)));
  if (maxResidual <= 1e-12 * scale) {
    return { transitions: 0, expected: 0, curved: false, exact: true };
  }

  // Transitions between opposite signs. A zero residual is a point sitting on
  // the line and breaks no run, so it is skipped rather than counted.
  const signs = fit.residuals.map((r) => Math.sign(r)).filter((s) => s !== 0);
  let transitions = 0;
  for (let i = 1; i < signs.length; i++) {
    if (signs[i] !== signs[i - 1]) transitions++;
  }
  const expected = (signs.length - 1) / 2;
  return {
    transitions,
    expected,
    // Fewer transitions than a third of the maximum means the residuals run in
    // streaks, which is what a systematic misfit looks like.
    curved: signs.length > 3 && transitions < (signs.length - 1) / 3,
    exact: false,
  };
}
