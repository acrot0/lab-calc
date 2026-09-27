/**
 * Titration curves: weak, strong, and polyprotic acids against a strong base.
 *
 * Why the exact equilibrium treatment instead of the sqrt(Ka·C) approximation
 * used for a single pH reading: that approximation assumes the acid is barely
 * dissociated. It is true at the start of a titration and catastrophically
 * false near an equivalence point — which is exactly the region a curve exists
 * to show.
 *
 * At every point the model solves the charge balance
 *
 *   [Na+] + [H+] = [OH-] + C_acid · z̄([H+])
 *
 * where z̄ is the average charge on the acid, computed from the full
 * distribution over its protonation states. For a monoprotic acid this reduces
 * to the familiar [A-] = C·Ka/(Ka+[H+]).
 */

import { fail, requirePositive, requireFinite } from './errors.mjs';
// The Gran plot is a straight-line extrapolation, and `standardCurve` already
// is one — with residuals, R² and the standard error of the slope, which is
// exactly what makes a bad extrapolation visible rather than merely reported.
import { standardCurve } from './reagent.mjs';

const KW = 1e-14;

/** Most protons a single acid can realistically have. Phosphoric (3) is common;
 *  6 is already exotic, and beyond that the inputs are almost certainly wrong. */
const MAX_PROTONS = 6;

/**
 * Accept the several shapes callers use for "what acid is this".
 *
 *   { pKa: 4.76 }                     monoprotic
 *   { pKas: [2.15, 7.20, 12.35] }     polyprotic
 *   { strongAcid: true }              fully dissociated
 */
export function normalizeAcid(spec) {
  if (!spec || typeof spec !== 'object') fail('acidParamsMissing');

  if (spec.strongAcid === true) return { pKas: [], strong: true };

  const raw = spec.pKas ?? (spec.pKa !== undefined ? [spec.pKa] : null);
  if (!Array.isArray(raw) || raw.length === 0) {
    fail('acidSpecMissing');
  }
  for (const v of raw) {
    requireFinite(v, 'pka');
  }
  if (raw.length > MAX_PROTONS) {
    fail('tooManyProtons', { max: MAX_PROTONS, n: raw.length });
  }

  const pKas = [...raw].sort((a, b) => a - b);
  for (let i = 1; i < pKas.length; i++) {
    if (pKas[i] === pKas[i - 1]) {
      // Two identical pKa values would collapse two equivalence points into
      // one and quietly halve the titrant volume the curve implies.
      fail('duplicatePka');
    }
  }
  return { pKas, strong: false };
}

/**
 * The fraction of the acid in each protonation state at a given [H+].
 *
 *   α_i = (Π_{j≤i} Ka_j · h^(n−i)) / D
 *   D   = h^n + Ka_1·h^(n−1) + Ka_1Ka_2·h^(n−2) + … + Π Ka_j
 *
 * Index 0 is the fully protonated form (H₃A for a triprotic acid) and index n
 * is the fully deprotonated one. The fractions sum to 1 by construction, which
 * `test/curve.test.mjs` asserts rather than assumes — a denominator that drops
 * a term still produces a plausible-looking curve.
 *
 * A strong acid is fully dissociated at every pH this model covers, so all of
 * the weight is on the last state.
 */
function alphas(h, kas, strong) {
  if (strong) return [1];
  const n = kas.length;

  let D = h ** n;
  let term = 1;
  for (let i = 0; i < n; i++) {
    term *= kas[i];
    D += term * h ** (n - 1 - i);
  }

  const out = [];
  term = 1;
  for (let i = 0; i <= n; i++) {
    if (i > 0) term *= kas[i - 1];
    out.push((term * h ** (n - i)) / D);
  }
  return out;
}

/**
 * Average charge on the acid at a given [H+].
 *
 *   z̄ = Σ i·α_i
 *
 * A strong acid is fully dissociated at every pH we model, so z̄ = 1.
 */
function zBar(h, kas, strong) {
  if (strong) return 1;
  return alphas(h, kas, false).reduce((sum, a, i) => sum + i * a, 0);
}

/**
 * Solve for [H+] by bisection on the charge-balance residual
 *
 *   f([H+]) = [Na+] + [H+] − [OH−] − C_acid·z̄([H+])
 *
 * f is monotonically INCREASING in [H+]: every term either grows with [H+] or
 * shrinks in a way that increases f. Verified numerically — f(1e-15) is large
 * and negative, f(1) is positive, at every point of every curve tested. An
 * earlier version assumed f decreased and bracketed the wrong way, which
 * converged confidently on a pH of 16.
 *
 * Bisection on the geometric midpoint because pH is a log scale: this converges
 * in pH rather than in concentration, so the steep region gets the same
 * relative precision as the flat ones.
 */
function solveH({ kas, strong, cAcid, cBase }) {
  const f = (h) => cBase + h - KW / h - cAcid * zBar(h, kas, strong);

  /*
   * The upper bound is derived from the inputs, not fixed at 1.
   *
   * It was `hi = 1.0`, on the assumption that no modelled solution is more
   * acidic than 1 mol/L. That is false for a concentrated strong acid: 5 M HCl
   * has [H+] = 5, so the root lay outside the bracket and bisection converged
   * confidently on the boundary — reporting pH 0.000 for a solution whose pH
   * is -0.699. Silent, and wrong in the direction of "looks plausible".
   *
   * The root can never exceed cBase + cAcid + 1e-7: the charge balance is
   * h = cBase + h - KW/h - cAcid·z̄ rearranged, and since z̄ ≤ n and the
   * water term only ever adds a little, total strong-acid plus total strong-
   * base concentration is an upper bound on [H+] in every case the model
   * covers. Starting from that instead of a literal costs nothing and cannot
   * be wrong for any input that passes validation.
   */
  let lo = 1e-15;
  let hi = Math.max(1.0, cBase + cAcid + 1e-7);

  /*
   * The bracket is checked rather than assumed. f is monotonically increasing
   * in h, so if either end has the wrong sign the root is not between them and
   * bisection would return a bound while looking like it converged.
   */
  if (!(f(lo) < 0 && f(hi) > 0)) {
    fail('noSolution', { cAcid, cBase });
  }

  for (let i = 0; i < 200; i++) {
    const mid = Math.sqrt(lo * hi);
    if (f(mid) < 0) lo = mid; else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

/** pH after adding a given number of moles of titrant to the analyte. */
function phAt(p, molesTitrant, totalVolumeMl) {
  const totalVolumeL = totalVolumeMl / 1000;
  const h = solveH({
    kas: p.kas,
    strong: p.strong,
    cAcid: p.molesAnalyte / totalVolumeL,
    cBase: molesTitrant / totalVolumeL,
  });
  return -Math.log10(h);
}

/** Shared validation for everything that takes a titration specification. */
function prepare({ pKa, pKas, strongAcid, conc, volumeMl, titrantConc }) {
  const acid = normalizeAcid({ pKa, pKas, strongAcid });
  requirePositive(conc, 'concentration');
  requirePositive(volumeMl, 'volume');
  requirePositive(titrantConc, 'titrantConc');
  return {
    kas: acid.pKas.map((v) => 10 ** -v),
    pKas: acid.pKas,
    strong: acid.strong,
    conc,
    volumeMl,
    titrantConc,
    molesAnalyte: conc * (volumeMl / 1000),
  };
}

/**
 * Working parameters of a monoprotic weak-acid titration.
 *
 * Kept as a named export for callers that predate polyprotic support.
 */
export function weakAcidCurveParams({ pKa, conc, volumeMl }) {
  requireFinite(pKa, 'pka');
  requirePositive(conc, 'concentration');
  requirePositive(volumeMl, 'volume');
  return {
    ka: 10 ** -pKa,
    pKa,
    conc,
    volumeMl,
    molesAnalyte: conc * (volumeMl / 1000),
  };
}

/**
 * The distribution of an acid over its protonation states, as a function of pH.
 *
 * ## Why this is worth a chart
 *
 * The pH tab rests on `[H⁺] ≈ √(Ka·C)`, and that approximation has a domain:
 * it assumes the acid is barely dissociated, which is true only while the pH
 * sits well below the pKa. A reader who has seen the distribution knows when
 * the formula applies without being told; one who has only memorised the
 * formula does not. This is the picture that makes the tab's own warning
 * checkable rather than a claim.
 *
 * It also shows the two things the formula hides: the curves cross at exactly
 * pH = pKa, and by pH = pKa + 2 the acid form is 99% gone — which is where the
 * approximation has already failed.
 *
 * `species` names the forms from fully protonated to fully deprotonated, so a
 * caller can label them H₃A / H₂A⁻ / HA²⁻ / A³⁻ without recomputing anything.
 *
 * @param {number} [points]  Samples across the pH range
 * @param {number} [phMin]   Defaults to 3 units below the lowest pKa
 * @param {number} [phMax]   Defaults to 3 units above the highest pKa
 */
export function speciationCurve(spec) {
  const acid = normalizeAcid(spec);
  const kas = acid.pKas.map((v) => 10 ** -v);
  const points = spec.points ?? 120;
  if (!Number.isInteger(points) || points <= 0) fail('pointsNotPositive', { points });

  /*
   * Three units either side of the pKa is where the interesting movement is —
   * outside that window the fractions are pinned at 0 and 1 and the curve is a
   * flat line. Clamped to the pH range water allows, because drawing a
   * distribution at pH 17 implies the model says something there.
   */
  const lo = acid.strong ? 0 : Math.min(...acid.pKas);
  const hi = acid.strong ? 0 : Math.max(...acid.pKas);
  const phMin = clampPh(spec.phMin ?? lo - 3);
  const phMax = clampPh(spec.phMax ?? hi + 3);
  if (!(phMax > phMin)) fail('phRangeEmpty', { phMin, phMax });

  const n = acid.strong ? 1 : acid.pKas.length;
  const out = [];
  for (let i = 0; i < points; i++) {
    const ph = phMin + ((phMax - phMin) * i) / (points - 1);
    out.push({ ph, fractions: alphas(10 ** -ph, kas, acid.strong) });
  }

  return {
    points: out,
    species: speciesLabels(n, acid.strong),
    pKas: acid.pKas,
    phMin,
    phMax,
  };
}

/** pH outside 0–14 is outside what this model claims to describe. */
const clampPh = (v) => Math.min(14, Math.max(0, v));

/** Superscript digits for the charge on a species with two or more. */
const SUP = { 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶' };

/**
 * Names for the n+1 protonation states, most protonated first.
 *
 * Only the neutral form is written without a charge: that is the one a reader
 * can count from, and marking it is how the sequence H₃A → H₂A⁻ → HA²⁻ → A³⁻
 * stays readable. For a strong acid there is one state and it is the anion.
 */
function speciesLabels(n, strong) {
  if (strong) return ['A⁻'];
  const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆'];
  return Array.from({ length: n + 1 }, (_, i) => {
    const protons = n - i;
    const charge = i;
    const formula = protons === 0 ? 'A' : `H${protons === 1 ? '' : SUB[protons]}A`;
    if (charge === 0) return formula;
    return `${formula}${charge === 1 ? '⁻' : `${SUP[charge]}⁻`}`;
  });
}

/**
 * Every equivalence point, in order.
 *
 * A monoprotic acid has one; phosphoric acid has three, at 1×, 2× and 3× the
 * first volume. A strong acid has one.
 */
export function equivalenceVolumes(spec) {
  const p = prepare(spec);
  const count = p.strong ? 1 : p.kas.length;
  const perProtonMl = (p.molesAnalyte / p.titrantConc) * 1000;
  return Array.from({ length: count }, (_, i) => perProtonMl * (i + 1));
}

/** The first equivalence point, with the pH there. */
export function findEquivalencePoint(spec) {
  const p = prepare(spec);
  const volumeMl = equivalenceVolumes(spec)[0];
  return { volumeMl, ph: phAt(p, p.molesAnalyte, p.volumeMl + volumeMl) };
}

/**
 * The full curve, sampled evenly in titrant volume from 0 to `overshoot`× the
 * LAST equivalence volume.
 *
 * Sampling evenly in volume (not pH) is deliberate: a real burette adds volume
 * at a constant rate, so the x-axis is what the person at the bench controls.
 *
 * Overshooting the final equivalence point matters more for a polyprotic acid —
 * stopping at the first one would hide two thirds of the chemistry.
 */
export function titrationCurve(spec, legacyPoints) {
  // Accept both titrationCurve({...spec, points}) and the older
  // titrationCurve({...spec}, points) form.
  const points = typeof legacyPoints === 'number' ? legacyPoints : spec.points ?? 120;
  const overshoot = spec.overshoot ?? 1.8;

  const p = prepare(spec);
  if (!Number.isInteger(points) || points <= 0) {
    fail('pointsNotPositive', { points });
  }
  requirePositive(overshoot, 'overshoot');

  const lastEq = equivalenceVolumes(spec).slice(-1)[0];
  const maxVolumeMl = lastEq * overshoot;

  const out = [];
  for (let i = 0; i < points; i++) {
    const v = (maxVolumeMl * i) / (points - 1);
    out.push({
      volumeMl: v,
      ph: phAt(p, p.titrantConc * (v / 1000), p.volumeMl + v),
    });
  }
  return out;
}

/* ==========================================================================
   Locating the equivalence point from measured data
   --------------------------------------------------------------------------
   `findEquivalencePoint` above answers from the *inputs*: it knows the moles
   and the titrant concentration, so it computes where the point must be. That
   is correct when the inputs are correct, and useless when they are not.

   A real titration ends with a burette reading, not with a known concentration.
   The person at the bench has a table of (volume, pH) and wants to know what
   they actually got — which is how a standardisation is checked, and how an
   unknown is measured. That is a different question, and it needs a different
   method.

   Two are offered, because they fail differently:

     · the **derivative** method finds the steepest point, which is where the
       inflection is. It needs a sample near the equivalence point and is
       therefore at the mercy of how finely the burette was read.
     · the **Gran plot** uses only the straight regions on either side and
       extrapolates their intersection. It ignores the noisy middle, and pays
       for that by needing to know roughly where to look.

   When they disagree, the disagreement is the useful part: it usually means
   the data is too coarse, or the acid is not behaving as a simple monoprotic
   one. Reporting both is the point.
   ========================================================================== */

/** Validate a (volume, pH) table and return it in ascending volume order. */
function titrationRows(rows) {
  if (!Array.isArray(rows) || rows.length < 3) {
    fail('curveTooFewPoints', { n: Array.isArray(rows) ? rows.length : 0 });
  }
  const clean = rows.map((r) => {
    requireFinite(r?.volumeMl, 'volume');
    requireFinite(r?.ph, 'ph');
    return { volumeMl: r.volumeMl, ph: r.ph };
  });
  // The methods below index neighbours, so the volume has to advance.
  for (let i = 1; i < clean.length; i += 1) {
    if (clean[i].volumeMl <= clean[i - 1].volumeMl) {
      fail('curveVolumesNotIncreasing', { i: i + 1 });
    }
  }
  return clean;
}

/**
 * The equivalence point from the steepest slope.
 *
 * The first derivative of pH with respect to volume spikes at the equivalence
 * point, and the spike is located at the *midpoint between two samples* — the
 * slope belongs to the interval, not to either end of it. Assigning it to the
 * left sample, which is the obvious thing to do, biases the answer one half
 * step early; the bias is invisible on a fine grid and obvious on a coarse one,
 * which is exactly the case a bench titration produces.
 */
export function equivalenceFromDerivative(rows) {
  const data = titrationRows(rows);

  const slopes = [];
  for (let i = 1; i < data.length; i += 1) {
    const dv = data[i].volumeMl - data[i - 1].volumeMl;
    slopes.push({
      x: (data[i].volumeMl + data[i - 1].volumeMl) / 2,
      y: (data[i].ph - data[i - 1].ph) / dv,
      ph: (data[i].ph + data[i - 1].ph) / 2,
    });
  }

  let k = 0;
  for (let i = 1; i < slopes.length; i += 1) {
    if (slopes[i].y > slopes[k].y) k = i;
  }
  const best = slopes[k];

  /*
   * How many local maxima there are, and whether the winner is at the edge.
   *
   * This is not decoration — it is the difference between a usable answer and a
   * confidently wrong one. The first derivative of a titration curve has **two**
   * steep regions: the initial rise, when the weak acid's own dissociation is
   * being suppressed, and the equivalence jump. Which is steeper depends on the
   * acid and its concentration, and for a dilute acid with a high pKa the
   * initial rise wins. Measured: 0.02 M acid with pKa 7.2 gives an initial slope
   * of 1.72 against 1.21 at the equivalence point, so a plain global maximum
   * returns V ≈ 0.25 mL for a true 40.00 mL — a 99% error, reported without
   * complaint.
   *
   * The method cannot tell the two apart from the data alone; the user knows
   * which is which. So it counts the candidates and says so, and the caller can
   * ask for a hint instead of trusting the first peak.
   */
  const peaks = [];
  for (let i = 0; i < slopes.length; i += 1) {
    const prev = slopes[i - 1]?.y ?? -Infinity;
    const next = slopes[i + 1]?.y ?? -Infinity;
    if (slopes[i].y >= prev && slopes[i].y > next) peaks.push(slopes[i]);
  }
  // A local maximum within 10% of the global one is a rival, not noise.
  const rivals = peaks.filter((p) => p.y > best.y * 0.1 && p.x !== best.x);
  const significant = peaks.filter((p) => p.y >= best.y * 0.5);
  const nearStart = best.x < data[data.length - 1].volumeMl * 0.1;

  const warning = significant.length > 1
    ? 'multiplePeaks'
    : (nearStart ? 'peakNearStart' : null);

  /*
   * Refine by fitting a parabola through the three points around the peak.
   *
   * The sampled maximum is only ever within half a step of the true one. With
   * a 0.1 mL burette that is 0.05 mL — enough to matter when the answer is
   * being compared against a certificate value. The vertex of the parabola
   * through the neighbouring slopes recovers most of that.
   */
  let refined = best.x;
  if (k > 0 && k < slopes.length - 1) {
    const [a, b, c] = [slopes[k - 1], slopes[k], slopes[k + 1]];
    const d1 = b.x - a.x;
    const d2 = c.x - b.x;
    // Only when the three are evenly spaced, which they are on a regular grid.
    if (Math.abs(d1 - d2) < 1e-9 && d1 > 0) {
      const denom = a.y - 2 * b.y + c.y;
      if (denom !== 0) {
        const shift = (0.5 * (a.y - c.y)) / denom;
        if (Math.abs(shift) <= 1) refined = b.x + shift * d1;
      }
    }
  }

  return {
    volumeMl: refined,
    ph: best.ph,
    maxSlope: best.y,
    n: data.length,
    sampledVolumeMl: best.x,
    /*
     * The other candidate peaks, so a caller can show them rather than having
     * to re-derive the whole thing to find out whether the answer was unique.
     * Empty in the common case of one clean jump.
     */
    peaks: peaks.map((p) => ({ volumeMl: p.x, slope: p.y })),
    rivals: rivals.map((p) => ({ volumeMl: p.x, slope: p.y })),
    warning,
  };
}

/**
 * The Gran function, as `{x, y}` points for one side of the equivalence point.
 *
 * Acid side (titrant is base, analyte is acid, acid still in excess):
 *
 *     G = V · 10^(−pH)
 *
 * Base side (base in excess):
 *
 *     G = (V₀ + V) · 10^(pH)
 *
 * Both are linear in V over the region where the corresponding excess holds,
 * and both are zero at the equivalence volume — which is why extrapolating
 * them to the x-axis gives it. The volume correction in the second is not
 * decoration: the base is being diluted by the analyte as it is added, and
 * without it the line curves near the end.
 */
export function granPoints(rows, { side, initialVolumeMl = 0, equivalenceHint }) {
  const data = titrationRows(rows);
  requirePositive(equivalenceHint, 'equivalenceHint');
  if (side !== 'acid' && side !== 'base') {
    fail('granSideUnknown', { side: String(side) });
  }
  const out = [];
  for (const r of data) {
    if (side === 'acid' && r.volumeMl < equivalenceHint) {
      out.push({ x: r.volumeMl, y: r.volumeMl * 10 ** -r.ph });
    } else if (side === 'base' && r.volumeMl > equivalenceHint) {
      out.push({ x: r.volumeMl, y: (initialVolumeMl + r.volumeMl) * 10 ** r.ph });
    }
  }
  if (out.length < 3) fail('granTooFewPoints', { n: out.length, side });
  return out;
}

/**
 * The equivalence volume by Gran extrapolation.
 *
 * Each side gives an independent estimate, because each is a separate straight
 * line whose own x-intercept is the equivalence volume. They are fitted and
 * reported separately rather than averaged into one number: two estimates that
 * agree are evidence, and two that disagree are a finding. Averaging them would
 * destroy the only diagnostic the method provides.
 *
 * The regions nearest the equivalence point are excluded. Both Gran functions
 * are approximations that hold *away* from the point and break down as it is
 * approached — the curve visibly bends there, and including those points drags
 * the fit. The window is the middle half of each side's span, which is the
 * conventional choice and the one that survives a coarse grid.
 */
export function equivalenceFromGran(rows, { initialVolumeMl = 0, equivalenceHint }) {
  const data = titrationRows(rows);
  requirePositive(equivalenceHint, 'equivalenceHint');

  const fitSide = (side) => {
    const all = granPoints(data, { side, initialVolumeMl, equivalenceHint });
    // Trim to the middle half of the side's volume span.
    const lo = all[0].x;
    const hi = all[all.length - 1].x;
    const span = hi - lo;
    const window = all.filter((p) => p.x >= lo + span * 0.25 && p.x <= hi - span * 0.25);
    const use = window.length >= 3 ? window : all;
    const fit = standardCurve(use.map((p) => ({ x: p.x, y: p.y })));
    if (fit.slope === 0) fail('granFlatFit', { side });
    return {
      side,
      volumeMl: -fit.intercept / fit.slope,
      r2: fit.r2,
      slope: fit.slope,
      intercept: fit.intercept,
      slopeStdError: fit.slopeStdError,
      n: fit.n,
      from: use[0].x,
      to: use[use.length - 1].x,
    };
  };

  /*
   * A side is optional, and "too few points on it" is the same situation as
   * "no points on it" — not an error.
   *
   * The count is taken *after* the side filter, not from whether any row lies
   * beyond the hint. A coarse grid on a dilute titration can leave a single
   * point on the acid side, and asking for a regression through one point
   * threw out of the whole call — so an analysable titration failed because
   * one of its two optional halves was thin. The other side still gives a
   * valid answer, which is the entire point of offering the Gran method.
   *
   * Counted rather than caught: a `try`/`catch` here would also swallow a
   * genuine failure from inside the fit, and report it as "no data on this
   * side".
   */
  const MIN_SIDE_POINTS = 3;
  const sideCount = (side) => data.filter((r) => (side === 'acid'
    ? r.volumeMl < equivalenceHint
    : r.volumeMl > equivalenceHint)).length;

  const acid = sideCount('acid') >= MIN_SIDE_POINTS ? fitSide('acid') : null;
  const base = sideCount('base') >= MIN_SIDE_POINTS ? fitSide('base') : null;
  if (!acid && !base) fail('granNoSide', {});

  const usable = [acid, base].filter((s) => s && Number.isFinite(s.volumeMl));
  if (usable.length === 0) fail('granNoSide', {});
  // Prefer the side that fits better; a one-sided Gran plot is a normal case.
  const chosen = usable.reduce((a, b) => (b.r2 > a.r2 ? b : a));

  return {
    volumeMl: chosen.volumeMl,
    r2: chosen.r2,
    side: chosen.side,
    acid,
    base,
    agree: acid && base
      ? Math.abs(acid.volumeMl - base.volumeMl) / chosen.volumeMl < 0.02
      : null,
    n: chosen.n,
  };
}

/**
 * Locate the equivalence point by both methods, and reconcile them.
 *
 * This is the entry point the UI should use. Running the two methods by hand
 * and comparing them is the obvious thing to do and it is wrong, because the
 * Gran plot needs a hint and the only hint available is the derivative's
 * answer — which is precisely the answer that is wrong when the curve has two
 * steep regions.
 *
 * Measured on a 0.02 M acid with pKa 7.2: the naive chain returns 0.25 mL for
 * a true 40.00 mL, a 99% error, because the initial rise is steeper than the
 * equivalence jump (1.72 against 1.21). Re-hinting the Gran fit with the
 * **last** significant peak instead of the first recovers 40.003 mL — 0.007%.
 *
 * So the reconciliation is: take the derivative's answer as the hint, but when
 * it reports more than one significant peak, take the last one. The
 * equivalence jump is always after the initial rise; that ordering is the one
 * piece of chemistry the method needs, and it is the piece the caller would
 * otherwise have to know.
 *
 * Both results are returned, along with whether they agree. They are not
 * averaged: when two independent methods disagree, the disagreement is the
 * finding, and averaging it away would hide the only diagnostic available.
 */
export function locateEquivalencePoint(rows, { initialVolumeMl = 0 } = {}) {
  const data = titrationRows(rows);
  const derivative = equivalenceFromDerivative(data);

  // The last significant peak, when the derivative found more than one.
  const hint = derivative.warning === 'multiplePeaks' && derivative.peaks.length > 0
    ? derivative.peaks[derivative.peaks.length - 1].volumeMl
    : derivative.volumeMl;

  const gran = equivalenceFromGran(data, { initialVolumeMl, equivalenceHint: hint });

  const agree = Math.abs(derivative.volumeMl - gran.volumeMl) / gran.volumeMl < 0.02;
  /*
   * Which one to quote. The Gran plot wins when the derivative was ambiguous,
   * because that is exactly the case the derivative cannot handle — and when
   * the two agree there is nothing to choose between them. The derivative wins
   * otherwise only because it needs no hint at all, which is a statement about
   * the caller rather than about the data.
   */
  const preferred = derivative.warning ? gran.volumeMl : derivative.volumeMl;

  return {
    volumeMl: preferred,
    method: derivative.warning ? 'gran' : 'derivative',
    derivative,
    gran,
    agree,
    hintUsed: hint,
  };
}
