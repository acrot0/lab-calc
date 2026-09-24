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

const requirePositive = (v, name) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    throw new Error(`${name}必须大于 0（当前为 ${v}）`);
  }
};

const requireNonNegative = (v, name) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    throw new Error(`${name}不能为负数（当前为 ${v}）`);
  }
};

/** pH of a weak acid from its pKa and formal concentration. */
export function weakAcidPh({ pKa, conc }) {
  if (typeof pKa !== 'number' || !Number.isFinite(pKa)) {
    throw new Error('pKa 必须是有效数字');
  }
  requirePositive(conc, '浓度');
  // [H+] = sqrt(Ka·C);  pH = 0.5·(pKa - log10(C))
  return 0.5 * (pKa - Math.log10(conc));
}

/** pH of a weak base from its pKb and formal concentration. */
export function weakBasePh({ pKb, conc }) {
  if (typeof pKb !== 'number' || !Number.isFinite(pKb)) {
    throw new Error('pKb 必须是有效数字');
  }
  requirePositive(conc, '浓度');
  const pOH = 0.5 * (pKb - Math.log10(conc));
  return 14 - pOH;
}

/** Volume of titrant needed to reach the equivalence point. */
export function equivalenceVolume({ analyteConc, analyteVolumeMl, titrantConc }) {
  requirePositive(analyteConc, '待测液浓度');
  requirePositive(analyteVolumeMl, '待测液体积');
  requirePositive(titrantConc, '滴定液浓度');
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
  requireNonNegative(percent, '百分比');
  const M = molarMass(formula);
  const gramsPerL = percent * 10;
  return gramsPerL / M;
}

/** Molarity to w/v percentage. Inverse of percentToMolarity. */
export function molarityToPercent({ molarity, formula }) {
  requireNonNegative(molarity, '浓度');
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
  requireNonNegative(percent, '百分比');
  requirePositive(volumeMl, '体积');

  const massG = (percent / 100) * volumeMl;

  let solubilityWarning = null;
  if (formula) {
    const limit = SOLUBILITY_G_PER_100ML[formula];
    if (limit !== undefined && percent > limit) {
      solubilityWarning =
        `${percent}% w/v 超过了 ${formula} 在室温下的溶解度（约 ${limit} g/100 mL），该浓度无法直接配出。`;
    }
  }

  return { massG, volumeMl, percent, solubilityWarning };
}
