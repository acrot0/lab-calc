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
export const USEFUL_RANGE = 1;

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

/** Unit tables. Keys are the canonical symbol; values are the factor to the base unit. */
export const MASS_UNITS = { kg: 1000, g: 1, mg: 1e-3, ug: 1e-6, ng: 1e-9 };
export const VOLUME_UNITS = { L: 1000, mL: 1, uL: 1e-3, nL: 1e-6 };
export const CONC_UNITS = { M: 1, mM: 1e-3, uM: 1e-6, nM: 1e-9, pM: 1e-12 };

const TABLES = [MASS_UNITS, VOLUME_UNITS, CONC_UNITS];

function factorOf(unit) {
  for (const t of TABLES) {
    if (unit in t) return t[unit];
  }
  fail('unknownUnit', { unit });
}

/**
 * Convert between units within one dimension.
 *
 * Looks the unit up across all tables; an unrecognised symbol throws rather
 * than defaulting to a factor of 1, which would silently return the input.
 */
export function unitConvert(value, from, to) {
  requireFinite(value, 'value');
  const f = factorOf(from);
  const t = factorOf(to);
  return (value * f) / t;
}
