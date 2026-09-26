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

/**
 * The Nernst line: E against log Q, with the cell's own operating point on it.
 *
 * ## What a single number cannot say
 *
 * The tab reports one potential for one reaction quotient. But E depends on Q
 * logarithmically, so the useful question is usually not "what is E now" but
 * "how much can Q move before the cell stops driving the reaction" — and that
 * is where the line crosses E = 0. Drawn, that crossing is a distance along the
 * axis; tabulated, it is a number the reader has to solve for.
 *
 * The slope is RT·ln10/nF, so the line's steepness *is* the n and the
 * temperature the tab is set to. Change the temperature and the line rotates
 * about log Q = 0; change n and it does the same. That is the relationship the
 * four separate rows in the result table cannot express.
 *
 * ## The range brackets the operating point, and only sometimes the crossing
 *
 * `logQMin`/`logQMax` default to one decade either side of the cell's own
 * log Q. That window is where the line is informative, and it is deliberately
 * *not* stretched to reach E = 0.
 *
 * The first version did stretch — on the argument that the crossing is the
 * point of the plot. It is not, for most cells: log₁₀K is nE°/0.05916, so a
 * Daniell cell (E° = 1.1 V, n = 2) reaches equilibrium at log Q ≈ 37. Drawing
 * 38 decades to reach it squashes the operating point onto the left edge and
 * the near-field slope — the thing a reader can actually act on — into one
 * pixel. A cell that far from equilibrium has no interesting headroom to
 * measure; the honest chart for it is the slope.
 *
 * So the crossing is drawn when it falls inside the window, and `zeroCrossing`
 * is null when it does not. The marker's presence therefore means "you are
 * within a decade of equilibrium", which is a fact about the cell rather than
 * an accident of the axis.
 *
 * @param {number} [points] Samples along the line
 * @param {number} [logQMin]
 * @param {number} [logQMax]
 */
export function nernstLine({ e0, n, q, tempC = 25, points = 120, logQMin, logQMax }) {
  requirePositive(n, 'electrons');
  requirePositive(q, 'reactionQuotient');
  if (typeof e0 !== 'number' || !Number.isFinite(e0)) fail('mustBeFinite', { name: 'e0' });
  if (!Number.isInteger(points) || points <= 0) fail('pointsNotPositive', { points });

  const base = nernst({ e0, n, q, tempC });
  const logQ0 = base.logQ;

  /*
   * Where E = 0. It is the same quantity the tab reports as log10 K — a cell at
   * equilibrium has E = 0 by definition — so it is read from the existing
   * result rather than recomputed, which keeps the two from drifting.
   */
  const crossing = base.log10K;

  const lo = logQMin ?? logQ0 - 1;
  const hi = logQMax ?? logQ0 + 1;
  if (!(hi > lo)) fail('logRangeEmpty', { lo, hi });

  const out = [];
  for (let i = 0; i < points; i++) {
    const logQ = lo + ((hi - lo) * i) / (points - 1);
    out.push({ logQ, e: e0 - base.slope * logQ });
  }

  return {
    points: out,
    slope: base.slope,
    e0,
    n,
    tempK: base.tempK,
    // The cell's operating point, which the chart marks on the line.
    operatingPoint: { logQ: logQ0, e: base.e },
    // Where the line crosses E = 0, or null when the window does not reach it.
    // Null is the common case and it is meaningful: it says the cell is far
    // from equilibrium, not that the chart failed.
    zeroCrossing: crossing >= lo && crossing <= hi ? crossing : null,
    // Where it would be. Reported so a caller can say *how* far off equilibrium
    // the cell is rather than only that it is off — the two numbers differ by
    // everything the caption has to explain.
    zeroCrossingAt: crossing,
    logQMin: lo,
    logQMax: hi,
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
