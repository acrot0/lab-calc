import { fail, requirePositive } from './errors.mjs';

/**
 * Electrochemistry — the Nernst equation and cell potentials.
 *
 * Pure functions, no I/O. Potentials are IUPAC reduction potentials at 298.15 K
 * in volts versus the standard hydrogen electrode.
 *
 * The one mistake this module exists to prevent: E_cell is E_cathode − E_anode,
 * NOT the sum. Both numbers are tabulated as reductions, so adding them counts
 * the anode's electron release twice and inflates the voltage by ~0.76 V for a
 * zinc anode — a value that still looks like a plausible cell potential.
 */

/** CODATA 2018 Faraday constant, C/mol. */
export const FARADAY = 96485.33212;

/** CODATA 2018 molar gas constant, J/(mol·K). */
export const R_GAS = 8.314462618;

/** IUPAC standard reduction potentials, V vs SHE, aqueous, 298.15 K. */
export const STANDARD_POTENTIALS = {
  'Li+/Li': -3.0401,
  'K+/K': -2.931,
  'Ca2+/Ca': -2.868,
  'Na+/Na': -2.71,
  'Mg2+/Mg': -2.372,
  'Al3+/Al': -1.662,
  'Zn2+/Zn': -0.7618,
  'Fe2+/Fe': -0.447,
  'Ni2+/Ni': -0.257,
  'Pb2+/Pb': -0.1262,
  '2H+/H2': 0.0,
  'Cu2+/Cu': 0.3419,
  'Cu+/Cu': 0.521,
  'I2/I-': 0.5355,
  'Ag+/Ag': 0.7996,
  'Fe3+/Fe2+': 0.771,
  'O2/H2O': 1.229,
  'Br2/Br-': 1.087,
  'Cl2/Cl-': 1.35827,
  'MnO4-/Mn2+': 1.507,
  'F2/F-': 2.866,
};

/**
 * Cell potential under non-standard conditions.
 *
 *   E = E° − (RT / nF) · ln Q
 *
 * The 0.05916 V shortcut at 25 °C is just RT·ln10/F; computing it from R, T and
 * F rather than hardcoding it keeps the answer correct at any temperature,
 * which is the whole point of the temperature input.
 */
export function nernst({ e0, n, q, tempC = 25 }) {
  requirePositive(n, 'electrons');
  requirePositive(q, 'reactionQuotient');
  if (typeof e0 !== 'number' || !Number.isFinite(e0)) fail('mustBeFinite', { name: 'e0' });
  if (typeof tempC !== 'number' || !Number.isFinite(tempC)) fail('mustBeFinite', { name: 'tempC' });
  const tempK = tempC + 273.15;
  requirePositive(tempK, 'temperature');

  const logQ = Math.log10(q);
  // The 1/n lives here, so the textbook "0.05916 V per decade" is slope × n.
  // Getting that wrong for K is the easy mistake: log10 K = E°/slope, not
  // n·E°/slope — the n is already inside.
  const slope = (R_GAS * tempK * Math.LN10) / (n * FARADAY);
  const e = e0 - slope * logQ;

  const log10K = e0 / slope;
  // A made-up E° can push 10^x past the double range; Infinity in the result
  // panel reads as a real answer.
  const equilibriumK = log10K > 300 ? null : 10 ** log10K;

  return {
    e,
    e0,
    n,
    q,
    tempK,
    logQ,
    slope,
    deltaGKJ: (-n * FARADAY * e) / 1000,
    // Built from E°, not E: K describes the reaction at equilibrium, not the
    // cell as it is currently wired.
    equilibriumK,
    log10K,
    // Exactly 0 V is equilibrium — nothing drives the cell either way, so it is
    // not spontaneous in the direction written.
    spontaneous: e > 0,
  };
}

/** Cell potential from two half reactions, both tabulated as reductions. */
export function cellFromHalfCells({ cathode, anode }) {
  if (!(cathode in STANDARD_POTENTIALS)) fail('unknownHalfCell', { halfCell: cathode });
  if (!(anode in STANDARD_POTENTIALS)) fail('unknownHalfCell', { halfCell: anode });
  return {
    e0: STANDARD_POTENTIALS[cathode] - STANDARD_POTENTIALS[anode],
    cathode,
    anode,
    cathodePotential: STANDARD_POTENTIALS[cathode],
    anodePotential: STANDARD_POTENTIALS[anode],
  };
}
