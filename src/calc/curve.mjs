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
 * Average charge on the acid at a given [H+].
 *
 *   z̄ = Σ i·α_i,  α_i = (Π_{j≤i} Ka_j · h^(n-i)) / D
 *   D = h^n + Ka_1·h^(n-1) + Ka_1Ka_2·h^(n-2) + ... + Π Ka_j
 *
 * A strong acid is fully dissociated at every pH we model, so z̄ = 1.
 */
function zBar(h, kas, strong) {
  if (strong) return 1;
  const n = kas.length;

  let D = h ** n;
  let term = 1;
  for (let i = 0; i < n; i++) {
    term *= kas[i];
    D += term * h ** (n - 1 - i);
  }

  let sum = 0;
  term = 1;
  for (let i = 1; i <= n; i++) {
    term *= kas[i - 1];
    sum += (i * term * h ** (n - i)) / D;
  }
  return sum;
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
