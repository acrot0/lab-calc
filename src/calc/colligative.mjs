/**
 * Colligative properties and osmometry.
 *
 * A solution's boiling point, freezing point and osmotic pressure depend on how
 * many dissolved particles there are, not on what they are. That is what makes
 * the group useful in both directions: a known solute gives a predicted shift,
 * and a measured shift gives the molar mass of an unknown — the classical way
 * to identify a compound before spectroscopy existed, and still the way melting
 * point is reported in a synthesis paper.
 *
 * The laws assume an ideal dilute solution. The assumption is flagged rather
 * than hidden, because the answer keeps being computable past the point where
 * it stops being true.
 *
 * Pure functions, no I/O, no i18n — errors are codes (see errors.mjs).
 */
import { fail, requirePositive, requireNonNegative, requireFinite } from './errors.mjs';

/** Ideal gas constant in L·atm·mol⁻¹·K⁻¹, the unit set osmometry uses. */
export const R_GAS = 0.08205736608096;

/**
 * Cryoscopic (Kf) and ebullioscopic (Kb) constants in K·kg/mol, with the
 * solvent's normal boiling and freezing points in °C.
 *
 * Standard tabulated values. Kf is generally much larger than Kb for the same
 * solvent, which is why melting point depression is the measurement of choice.
 */
export const SOLVENTS = {
  water: { kb: 0.512, kf: 1.86, bp: 100.0, fp: 0.0 },
  benzene: { kb: 2.53, kf: 5.12, bp: 80.1, fp: 5.5 },
  aceticAcid: { kb: 3.07, kf: 3.90, bp: 118.1, fp: 16.6 },
  ethanol: { kb: 1.22, kf: 1.99, bp: 78.37, fp: -114.6 },
  cyclohexane: { kb: 2.79, kf: 20.2, bp: 80.74, fp: 6.47 },
  camphor: { kb: 5.95, kf: 39.7, bp: 207.4, fp: 178.4 },
  chloroform: { kb: 3.63, kf: 4.68, bp: 61.2, fp: -63.5 },
  phenol: { kb: 3.04, kf: 7.40, bp: 181.7, fp: 40.5 },
};

/**
 * Above this molality the ideal-dilute assumption behind every colligative law
 * is no longer defensible, and the computed shift is optimistic.
 */
export const DILUTE_LIMIT = 0.5;

function solvent(name) {
  const s = SOLVENTS[name];
  if (!s) fail('unknownSolvent', { solvent: name, allowed: Object.keys(SOLVENTS) });
  return s;
}

/**
 * Boiling point elevation and freezing point depression.
 *
 *   ΔTb = i · Kb · m        ΔTf = i · Kf · m
 *
 * `i` is the van 't Hoff factor: the number of particles one formula unit
 * dissociates into. It is 1 for glucose, 2 for NaCl, 3 for CaCl2. Using 1 for a
 * salt halves the predicted effect — the single most common mistake here.
 */
export function colligative({ solvent: name, molality, i = 1 }) {
  const s = solvent(name);
  requireNonNegative(molality, 'molality');
  requirePositive(i, 'vanTHoffFactor');

  const deltaTb = i * s.kb * molality;
  const deltaTf = i * s.kf * molality;

  return {
    kb: s.kb,
    kf: s.kf,
    i,
    deltaTb,
    deltaTf,
    boilingPoint: s.bp + deltaTb,
    // Depression moves the freezing point DOWN, so it is subtracted.
    freezingPoint: s.fp - deltaTf,
    diluteWarning: molality > DILUTE_LIMIT
      ? { code: 'tooConcentrated', params: { molality, limit: DILUTE_LIMIT } }
      : null,
  };
}

/**
 * Osmotic pressure by the van 't Hoff equation.
 *
 *   π = i · M · R · T
 *
 * Reported in atm and kPa because the two literatures disagree: physiology
 * quotes osmolarity in atm against 7.3 for plasma, while osmometry instruments
 * read kPa.
 */
export function osmoticPressure({ molarity, i = 1, tempC = 25 }) {
  requireNonNegative(molarity, 'molarity');
  requirePositive(i, 'vanTHoffFactor');
  requireFinite(tempC, 'temperature');

  const tempK = tempC + 273.15;
  if (tempK <= 0) fail('mustBePositive', { name: 'temperature', value: tempK });

  const atm = i * molarity * R_GAS * tempK;
  return { atm, kPa: atm * 101.325, osmolarity: i * molarity, tempK };
}

/**
 * Molar mass of an unknown from the freezing point it produces.
 *
 *   m = ΔTf / (i · Kf)   →   n = m · kg(solvent)   →   M = mass / n
 *
 * This is the direction a synthesis lab actually uses: weigh the unknown, note
 * how far the melting point dropped, and the molar mass falls out.
 */
export function molarMassFromFreezingPoint({ solvent: name, deltaTf, massG, solventKg, i = 1 }) {
  const s = solvent(name);
  requirePositive(deltaTf, 'freezingPointDrop');
  requirePositive(massG, 'mass');
  requirePositive(solventKg, 'solventMass');
  requirePositive(i, 'vanTHoffFactor');

  const m = deltaTf / (i * s.kf);
  const moles = m * solventKg;
  return { molality: m, moles, molarMass: massG / moles, kf: s.kf };
}
