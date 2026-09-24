/**
 * Everyday bench arithmetic that the solution-chemistry calculators skip.
 *
 * Three groups:
 *
 *   1. Moles ↔ mass ↔ particles. Every other calculator does this with a fixed
 *      compound list; here the formula parser supplies the molar mass, and an
 *      explicit molar mass covers proteins and polymers that have no formula.
 *   2. Colony counting. The dilution factor is the step people invert, and the
 *      countable range is the step people ignore.
 *   3. Nucleic acid quantification and master-mix scaling — the two things a
 *      molecular bench does several times a day and still does on a scrap of
 *      paper.
 *
 * Pure functions, no I/O, no i18n — errors are codes (see errors.mjs).
 */
import { molarMass } from './solution.mjs';
import { fail, requirePositive, requireNonNegative, requireFinite } from './errors.mjs';

/** Avogadro constant, mol⁻¹ (CODATA 2018 exact value). */
export const AVOGADRO = 6.02214076e23;

/**
 * Moles ↔ mass ↔ particles, with molarity when a volume is given.
 *
 * Pass exactly one of `massG` or `moles`. The molar mass comes from `formula`
 * when one is given, otherwise from an explicit `molarMassGmol` — a protein has
 * no formula, and refusing to convert it would send the user back to a
 * calculator that can.
 */
export function moleConvert({ formula, massG, moles, volumeMl, molarMassGmol }) {
  const hasMass = massG !== undefined && massG !== null;
  const hasMoles = moles !== undefined && moles !== null;
  // Both would be over-determined and one of them would be silently ignored;
  // neither leaves nothing to convert. Refusing is the only honest answer.
  if (hasMass === hasMoles) fail('needsExactlyOne', { names: ['mass', 'moles'] });

  let M = molarMassGmol;
  if (M === undefined || M === null) {
    if (typeof formula !== 'string' || formula.trim().length === 0) {
      fail('molarMassRequired', {});
    }
    M = molarMass(formula);
  } else {
    requirePositive(M, 'molarMass');
  }

  const out = { molarMass: M };
  if (hasMass) {
    requireNonNegative(massG, 'mass');
    out.massG = massG;
    out.moles = massG / M;
  } else {
    requireNonNegative(moles, 'moles');
    out.moles = moles;
    out.massG = moles * M;
  }

  out.particles = out.moles * AVOGADRO;

  if (volumeMl !== undefined && volumeMl !== null) {
    requirePositive(volumeMl, 'volume');
    out.molarity = out.moles / (volumeMl / 1000);
  }

  return out;
}

/** Plates outside this range are not counted — the counting error is too large. */
export const COUNTABLE_MIN = 30;
export const COUNTABLE_MAX = 300;

/**
 * Colony-forming units per mL of the ORIGINAL sample.
 *
 *   CFU/mL = colonies × dilutionFactor ÷ platedVolume
 *
 * `dilutionFactor` is the reciprocal, as it is spoken: a sample diluted a
 * hundredfold is 100, not 0.01. Getting that backwards is an eight-order-of-
 * magnitude error that still produces a plausible-looking number, so the sign
 * convention is pinned by a test rather than left to a comment.
 */
export function cfuPerMl({ colonies, dilutionFactor, platedVolumeMl }) {
  requireNonNegative(colonies, 'colonies');
  requirePositive(dilutionFactor, 'dilutionFactor');
  requirePositive(platedVolumeMl, 'platedVolume');

  const cfu = (colonies * dilutionFactor) / platedVolumeMl;
  const countWarning = colonies < COUNTABLE_MIN
    ? { code: 'plateTooFew', params: { colonies, min: COUNTABLE_MIN } }
    : colonies > COUNTABLE_MAX
      ? { code: 'plateTooMany', params: { colonies, max: COUNTABLE_MAX } }
      : null;

  return { cfuPerMl: cfu, countable: countWarning === null, countWarning };
}

/** Average molar mass of a nucleotide residue, g/mol. */
export const NUCLEOTIDE_MASS = {
  // 660 g/mol per base pair is the standard shortcut; it already counts both
  // strands, so it must not be doubled.
  dsDNA: 660,
  ssDNA: 330,
  RNA: 340,
};

/**
 * Nucleic acid quantification.
 *
 *   pmol/µL = (ng/µL × 1000) ÷ (length × residueMass)
 *
 * Pass `concNgPerUl` to get the molarity and copy number, or `copiesPerUl` to
 * get the concentration needed to hit a copy number — the second direction is
 * what qPCR standard curves are built from.
 */
export function nucleicAcid({ concNgPerUl, copiesPerUl, lengthBp, kind = 'dsDNA', volumeUl }) {
  const residueMass = NUCLEOTIDE_MASS[kind];
  if (residueMass === undefined) fail('unknownKind', { kind, allowed: Object.keys(NUCLEOTIDE_MASS) });
  requirePositive(lengthBp, 'length');

  const hasConc = concNgPerUl !== undefined && concNgPerUl !== null;
  const hasCopies = copiesPerUl !== undefined && copiesPerUl !== null;
  if (hasConc === hasCopies) fail('needsExactlyOne', { names: ['concentration', 'copies'] });

  const M = lengthBp * residueMass;
  const out = { residueMass, molarMass: M, lengthBp };

  if (hasConc) {
    requireNonNegative(concNgPerUl, 'concentration');
    out.concNgPerUl = concNgPerUl;
    out.pmolPerUl = (concNgPerUl * 1000) / M;
  } else {
    requireNonNegative(copiesPerUl, 'copies');
    // 1 pmol is 1e-12 mol; copies = pmol × 1e-12 × N_A.
    out.pmolPerUl = copiesPerUl / (1e-12 * AVOGADRO);
    out.concNgPerUl = (out.pmolPerUl * M) / 1000;
  }

  out.copiesPerUl = out.pmolPerUl * 1e-12 * AVOGADRO;

  if (volumeUl !== undefined && volumeUl !== null) {
    requirePositive(volumeUl, 'volume');
    out.totalNg = out.concNgPerUl * volumeUl;
    out.totalPmol = out.pmolPerUl * volumeUl;
  }

  return out;
}

/**
 * Scale a master mix from per-reaction volumes.
 *
 *   total = perReaction × reactions × (1 + excess/100)
 *
 * The overage exists because a mix made for exactly N reactions runs short:
 * every pipette transfer leaves a few µL on the tip wall, so tube N gets less
 * than tube 1. Five to ten percent is the usual allowance.
 */
export function masterMix({ components, reactions, excessPercent = 0 }) {
  if (!Array.isArray(components) || components.length === 0) fail('componentsEmpty', {});
  requirePositive(reactions, 'reactions');
  requireNonNegative(excessPercent, 'excess');

  const factor = 1 + excessPercent / 100;
  const totalReactions = reactions * factor;

  const rows = components.map((c) => {
    const perReaction = c?.perReaction;
    requireFinite(perReaction, 'perReaction');
    if (perReaction < 0) fail('mustNotBeNegative', { name: 'perReaction', value: perReaction });
    return { name: c?.name ?? '', perReaction, total: perReaction * totalReactions };
  });

  return {
    reactions,
    excessPercent,
    totalReactions,
    rows,
    totalVolume: rows.reduce((sum, r) => sum + r.total, 0),
  };
}
