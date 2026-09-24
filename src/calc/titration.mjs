/**
 * Titration and concentration-expression conversions.
 *
 * Pure functions, no I/O — same contract as the other calc modules.
 *
 * The weak acid/base functions use the standard approximation
 *   [H+] ≈ sqrt(Ka × C)
 * which is valid while the acid is only slightly dissociated. At the
 * concentrations a bench chemist actually uses (0.001–1 M) that holds. It is
 * NOT valid near the equivalence point or for strong acids — for those the
 * dissociation must be solved properly, and this module deliberately does not
 * pretend otherwise.
 */
import { molarMass } from './solution.mjs';
import { requirePositive, requireNonNegative, requireFinite } from './errors.mjs';

/** pH of a weak acid from its pKa and formal concentration. */
export function weakAcidPh({ pKa, conc }) {
  requireFinite(pKa, 'pka');
  requirePositive(conc, 'concentration');
  // [H+] = sqrt(Ka·C);  pH = 0.5·(pKa - log10(C))
  return 0.5 * (pKa - Math.log10(conc));
}

/** pH of a weak base from its pKb and formal concentration. */
export function weakBasePh({ pKb, conc }) {
  requireFinite(pKb, 'pkb');
  requirePositive(conc, 'concentration');
  const pOH = 0.5 * (pKb - Math.log10(conc));
  return 14 - pOH;
}

/** Volume of titrant needed to reach the equivalence point. */
export function equivalenceVolume({ analyteConc, analyteVolumeMl, titrantConc }) {
  requirePositive(analyteConc, 'analyteConc');
  requirePositive(analyteVolumeMl, 'analyteVolumeMl');
  requirePositive(titrantConc, 'titrantConc');
  const molesAnalyte = analyteConc * (analyteVolumeMl / 1000);
  return {
    titrantVolumeMl: (molesAnalyte / titrantConc) * 1000,
    molesAnalyte,
  };
}

/**
 * w/v percentage to molarity: 1% w/v is 1 g per 100 mL, i.e. 10 g/L.
 */
export function percentToMolarity({ percent, formula }) {
  requireNonNegative(percent, 'percent');
  const M = molarMass(formula);
  const gramsPerL = percent * 10;
  return gramsPerL / M;
}

/** Molarity to w/v percentage. Inverse of percentToMolarity. */
export function molarityToPercent({ molarity, formula }) {
  requireNonNegative(molarity, 'molarity');
  const M = molarMass(formula);
  return (molarity * M) / 10;
}

/**
 * Rough solubility of common lab salts, g per 100 mL of water at ~20 °C.
 *
 * Deliberately a small, well-known table rather than a large one: an entry
 * that is wrong is worse than no entry, because it produces a warning the user
 * learns to ignore.
 */
export const SOLUBILITY_G_PER_100ML = {
  NaCl: 36.0,
  KCl: 34.0,
  KNO3: 31.0,
  NaNO3: 88.0,
  Na2CO3: 21.5,
  NaHCO3: 9.6,
  NaOH: 109.0,
  CuSO4: 20.0,
  CaCl2: 74.5,
  MgSO4: 35.0,
  NH4Cl: 37.2,
};

/**
 * Mass of solid needed to make a w/v percentage solution, with a solubility
 * check when the compound is one we have data for.
 */
export function preparePercentSolution({ percent, volumeMl, formula }) {
  requireNonNegative(percent, 'percent');
  requirePositive(volumeMl, 'volume');

  const massG = (percent / 100) * volumeMl;

  let solubilityWarning = null;
  if (formula) {
    const limit = SOLUBILITY_G_PER_100ML[formula];
    if (limit !== undefined && percent > limit) {
      solubilityWarning = { code: 'solubilityExceeded', params: { percent, formula, limit } };
    }
  }

  return { massG, volumeMl, percent, solubilityWarning };
}
