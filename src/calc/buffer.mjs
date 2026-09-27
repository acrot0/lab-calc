import { fail, requirePositive, requireFinite } from './errors.mjs';

/**
 * Buffer chemistry, dilution series, and unit conversion.
 *
 * Pure functions, no I/O — same contract as solution.mjs.
 *
 * The buffering-range check exists because the Henderson–Hasselbalch equation
 * will happily return a pH for a ratio of 1000:1, and that buffer has almost
 * no capacity. The arithmetic is not wrong; the buffer is useless. Saying so
 * is the difference between a calculator and a useful one.
 */

/**
 * pH = pKa + log10([A-] / [HA])
 *
 * Rejects zero concentrations rather than returning ±Infinity, which is what
 * Math.log10(0) produces and which would render as a plausible-looking number
 * in a UI that does not check.
 */
export function hendersonHasselbalch({ pKa, acidConc, baseConc }) {
  requireFinite(pKa, 'pka');
  requirePositive(acidConc, 'acidConc');
  requirePositive(baseConc, 'baseConc');
  return pKa + Math.log10(baseConc / acidConc);
}

/** A buffer is useful within roughly pKa ± 1; beyond that capacity collapses. */
const USEFUL_RANGE = 1;

/**
 * The acid:base ratio for a target pH, and the split of a total concentration.
 *
 *   [A-]/[HA] = 10^(pH - pKa)
 */
export function bufferRecipe({ pKa, targetPh, totalConc }) {
  requireFinite(pKa, 'pka');
  requireFinite(targetPh, 'targetPh');
  const ratio = 10 ** (targetPh - pKa);
  const out = {
    ratio,
    pKa,
    targetPh,
    inRange: Math.abs(targetPh - pKa) <= USEFUL_RANGE,
  };
  if (typeof totalConc === 'number') {
    requirePositive(totalConc, 'totalConc');
    // [HA] = C / (1 + ratio), [A-] = C - [HA]
    out.acidConc = totalConc / (1 + ratio);
    out.baseConc = totalConc - out.acidConc;
  }
  return out;
}

/**
 * A serial dilution series, each step diluting the previous by a fixed factor.
 *
 * Each step mixes `stepVolumeMl / factor` of the previous solution with the
 * remaining volume of diluent.
 */
export function dilutionSeries({ stockConc, factor, steps, stepVolumeMl = 100 }) {
  requirePositive(stockConc, 'stockConc');
  if (typeof factor !== 'number' || !Number.isFinite(factor) || factor <= 1) {
    fail('factorTooSmall', { factor });
  }
  if (!Number.isInteger(steps) || steps <= 0) {
    fail('stepsNotPositive', { steps });
  }
  requirePositive(stepVolumeMl, 'stepVolume');

  const out = [];
  let conc = stockConc;
  for (let i = 0; i < steps; i++) {
    conc = conc / factor;
    const stockVolumeMl = stepVolumeMl / factor;
    out.push({
      step: i + 1,
      conc,
      stockVolumeMl,
      diluentVolumeMl: stepVolumeMl - stockVolumeMl,
      stepVolumeMl,
    });
  }
  return out;
}


/* ==========================================================================
   Buffer capacity (Van Slyke)
   --------------------------------------------------------------------------
   How much strong base, per litre, it takes to move the pH by one unit.

       β = dCb/dpH = 2.303·C·Ka[H⁺]/(Ka + [H⁺])²  +  2.303·([H⁺] + [OH⁻])
                     └── the buffer pair ──┘         └──── water ────┘

   The first term is what the buffer contributes and the second is what water
   contributes on its own. Both are kept: near neutral pH the water term is
   negligible and dropping it changes nothing, but at pH 12 with a pKa of 4.76
   it is the *only* thing resisting a pH change — the buffer pair has stopped
   working and a capacity quoted without it would say the solution has no
   resistance at all, which is false.

   The pair term peaks at pH = pKa, where it reduces to 2.303·C/4 = 0.5756·C.
   That maximum is the number to quote when comparing buffers, because it is
   the only capacity figure independent of how far the working pH has drifted
   from the pKa.
   ========================================================================== */

/** The pH range over which [H⁺] and [OH⁻] stay meaningful as concentrations. */
const PH_MIN = 0;
const PH_MAX = 14;

/**
 * Buffer capacity at a given pH.
 *
 * @returns {{
 *   total: number, buffer: number, water: number, fraction: number,
 *   acidConc: number, baseConc: number, ratio: number, maxCapacity: number,
 * }}
 *   `fraction` is total/max, the share of the best this buffer pair can do;
 *   `maxCapacity` is 0.5756·C, the value at pH = pKa.
 */
export function bufferCapacity({ pKa, totalConc, ph }) {
  requireFinite(pKa, 'pKa');
  requirePositive(totalConc, 'totalConc');
  requireFinite(ph, 'ph');
  if (ph < PH_MIN || ph > PH_MAX) fail('phOutsideScale', { ph });

  const ka = 10 ** -pKa;
  const h = 10 ** -ph;
  const oh = 1e-14 / h;

  // The Henderson–Hasselbalch split, which is also what the working shows:
  // the ratio decides how the total concentration divides between the pair.
  const ratio = 10 ** (ph - pKa);
  const baseConc = (totalConc * ratio) / (1 + ratio);
  const acidConc = totalConc - baseConc;

  const buffer = 2.303 * totalConc * ((ka * h) / (ka + h) ** 2);
  const water = 2.303 * (h + oh);
  const maxCapacity = 2.303 * totalConc / 4;

  return {
    total: buffer + water,
    buffer,
    water,
    fraction: maxCapacity > 0 ? (buffer + water) / maxCapacity : 0,
    acidConc,
    baseConc,
    ratio,
    maxCapacity,
  };
}

/**
 * Buffer capacity across the useful pH range, for plotting.
 *
 * The range is pKa ± `span` rather than 0–14: the interesting shape is the peak,
 * and a full-scale plot compresses it into a spike near the middle while
 * spending most of its width on the two regions where the buffer is irrelevant.
 * The water term is included, so the curve rises again at the edges — which is
 * real, and is the thing that surprises people.
 */
export function bufferCapacityCurve({ pKa, totalConc, span = 3, points = 61 }) {
  requireFinite(pKa, 'pKa');
  requirePositive(totalConc, 'totalConc');
  requirePositive(span, 'span');
  if (!Number.isInteger(points) || points < 2) fail('pointsNotPositive', { points });

  const lo = Math.max(PH_MIN, pKa - span);
  const hi = Math.min(PH_MAX, pKa + span);
  const out = [];
  for (let i = 0; i < points; i += 1) {
    const ph = lo + ((hi - lo) * i) / (points - 1);
    const r = bufferCapacity({ pKa, totalConc, ph });
    out.push({ ph, total: r.total, buffer: r.buffer, water: r.water });
  }
  return { points: out, pKa, totalConc, maxCapacity: 2.303 * totalConc / 4 };
}
