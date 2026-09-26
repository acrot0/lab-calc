/**
 * The formula registry — every calculation this app performs, declared.
 *
 * ## Why declare formulas as data
 *
 * The fifteen calculation tabs were each a hand-written form: inputs listed in
 * JSX, validation inline, the worked solution assembled by hand, and the record
 * keys typed as object literals. Adding a calculation meant writing a component,
 * and there was nowhere to look to find out what the app could actually do —
 * the answer was spread across fifteen files.
 *
 * Here a calculation declares its inputs, its outputs, its equation, its
 * assumptions and its source. From that one declaration the app derives:
 *
 *   - the input form (field type, unit, range, hint)
 *   - the recorded `inputs`/`outputs` keys, so they cannot drift from the form
 *   - the worked solution's equation line
 *   - the unit shown beside every number, including in exports
 *   - the assumptions printed with a result
 *
 * ## What this file is not
 *
 * It is not a formula *engine*. The arithmetic stays in the calc modules, where
 * it is testable and where the special cases live — a Nernst equation with a
 * temperature term is not a one-line expression, and pretending otherwise would
 * make the registry a worse programming language. The registry declares the
 * *interface*: what goes in, what comes out, in what units, under what
 * assumptions, and where the equation comes from.
 *
 * That split is deliberate. `formulas.mjs` is data and can be read by a human
 * to answer "what does this app do"; `solution.mjs` and friends are code and
 * answer "is the arithmetic right".
 *
 * ## Units are dimension ids
 *
 * `unit: 'mass'` names a *dimension* from `dimensions.mjs`, not a fixed symbol.
 * A field declared as mass accepts g, mg or kg and reports in whichever the
 * user picked, which is the whole point of having a unit registry. A field with
 * `unit: null` is a plain number — a count, a ratio, a pH.
 *
 * ## Provenance is required, not optional
 *
 * Every entry carries a `source`. A chemistry answer with no stated origin is
 * not a result, it is a rumour — and a student cannot check it. Where a value
 * is a physical constant the source names the authority (IUPAC, NIST, CODATA);
 * where it is a formula the source names the relationship and the conditions it
 * holds under.
 */

/**
 * An input field.
 *
 * The human label is NOT carried here. It comes from `field-labels.mjs`, keyed
 * by the same `key`, and that is the only table the report and the spreadsheet
 * read. A `labelKey` used to sit on every field pointing at a locale key under
 * `fields.`, but nothing ever read it — the label path had moved to
 * `fieldLabel()` and the property stayed behind, 107 of them. It is gone rather
 * than kept in sync, because a second label source that no code consults is a
 * second answer waiting to disagree with the first.
 *
 * @typedef {object} Field
 * @property {string}  key      Stored record key. Part of the data format.
 * @property {'number'|'text'|'select'} type
 * @property {string|null} unit Dimension id, or null for a plain number.
 * @property {boolean} [required]
 * @property {number}  [min]    Inclusive lower bound.
 * @property {number}  [max]
 * @property {string}  [options] Key of a table in the calc module, for selects.
 * @property {string}  [expr]   True when the field accepts an expression.
 */

/**
 * An output value.
 *
 * @typedef {object} Output
 * @property {string} key
 * @property {string|null} unit
 * @property {boolean} [trace] True for intermediate values shown in the worked
 *   solution but not as a headline result.
 */

/**
 * A calculation.
 *
 * @typedef {object} Formula
 * @property {string} id        Stable; matches the tab id.
 * @property {string} equation  The relationship, as written.
 * @property {string} source    Where the equation and its constants come from.
 * @property {string[]} assumptions  Printed with the result. A limitation the
 *   user cannot see is a limitation they will be misled by.
 * @property {Field[]} inputs
 * @property {Output[]} outputs
 * @property {string} [module]  The calc module implementing it.
 */

/** @type {Formula[]} */
export const FORMULAS = [
  /* ---------------------------------------------------------------------
   * Solution preparation
   * ------------------------------------------------------------------ */
  {
    id: 'weigh',
    module: 'solution.mjs',
    equation: 'm = c · V · M',
    source: 'Definition of molarity, c = n/V, rearranged. Molar masses are the '
      + 'IUPAC 2021 standard atomic weights, summed over the formula unit.',
    assumptions: [
      'The solid is the pure anhydrous substance — a hydrate needs its water of '
      + 'crystallisation added to M.',
      'Volumetric glassware is used at its calibration temperature (20 °C).',
    ],
    inputs: [
      { key: 'formula', type: 'text', unit: null, required: true },
      { key: 'targetMolarity', type: 'number', unit: 'molarity', required: true, min: 0, expr: true },
      { key: 'targetVolumeMl', type: 'number', unit: 'volume', required: true, min: 0, expr: true },
    ],
    outputs: [
      { key: 'massG', unit: 'mass' },
      { key: 'molarMass', unit: 'molarMass' },
      { key: 'moles', unit: 'amount' },
    ],
  },
  {
    id: 'dilute',
    module: 'solution.mjs',
    equation: 'c₁V₁ = c₂V₂',
    source: 'Conservation of solute: the amount of solute is unchanged by adding '
      + 'solvent, so the product of concentration and volume is invariant.',
    assumptions: [
      'Volumes are additive — true for dilute aqueous solutions, not for '
      + 'ethanol/water or other non-ideal mixtures.',
      'The stock concentration is accurate; this does not standardise it.',
    ],
    inputs: [
      { key: 'stockMolarity', type: 'number', unit: 'molarity', required: true, min: 0, expr: true },
      { key: 'targetMolarity', type: 'number', unit: 'molarity', required: true, min: 0, expr: true },
      { key: 'targetVolumeMl', type: 'number', unit: 'volume', required: true, min: 0, expr: true },
    ],
    outputs: [
      { key: 'stockVolumeMl', unit: 'volume' },
      { key: 'diluentVolumeMl', unit: 'volume' },
      { key: 'dilutionFactor', unit: null },
    ],
  },
  {
    id: 'series',
    module: 'solution.mjs',
    equation: 'Cₙ = C₀ / fⁿ',
    source: 'Repeated dilution: each step divides the concentration by the same '
      + 'factor, so n steps divide by f to the n.',
    assumptions: [
      'Every step uses the same dilution factor.',
      'Each tube is mixed before the next transfer is taken.',
    ],
    inputs: [
      { key: 'stockConc', type: 'number', unit: 'molarity', required: true, min: 0 },
      { key: 'factor', type: 'number', unit: null, required: true, min: 1 },
      { key: 'steps', type: 'number', unit: null, required: true, min: 1, max: 20 },
      { key: 'stepVolumeMl', type: 'number', unit: 'volume', required: true, min: 0 },
    ],
    outputs: [
      { key: 'series', unit: null },
    ],
  },
  {
    id: 'percent',
    module: 'titration.mjs',
    equation: 'm = %w/v · V / 100',
    source: 'Definition of weight-by-volume percent: grams of solute per 100 mL '
      + 'of solution.',
    assumptions: [
      '%w/v is grams per 100 mL of final solution, not per 100 mL of solvent.',
      'For %w/w a density is needed, which this screen does not ask for.',
    ],
    inputs: [
      { key: 'percent', type: 'number', unit: null, required: true, min: 0, max: 100 },
      { key: 'volumeMl', type: 'number', unit: 'volume', required: true, min: 0, expr: true },
    ],
    outputs: [
      { key: 'massG', unit: 'mass' },
    ],
  },
  {
    id: 'reagent',
    module: 'reagent.mjs',
    equation: 'c = 10 · ρ · w / M',
    source: 'Concentrated-reagent molarity from the bottle label: density, mass '
      + 'fraction and molar mass. The factor 10 converts %w/w and g/mL into mol/L.',
    assumptions: [
      'The assay and density are the label values at 20 °C. Both drift as the '
      + 'bottle is opened and absorbs water or loses volatile solute.',
      'The bottle is not assumed to be freshly opened.',
    ],
    inputs: [
      { key: 'formula', type: 'text', unit: null, required: true },
      { key: 'percent', type: 'number', unit: null, required: true, min: 0, max: 100 },
      { key: 'density', type: 'number', unit: 'massConcentration', required: true, min: 0 },
    ],
    outputs: [
      { key: 'molarity', unit: 'molarity' },
      { key: 'molarMass', unit: 'molarMass' },
      { key: 'molality', unit: 'molality' },
    ],
  },

  /* ---------------------------------------------------------------------
   * pH and buffers
   * ------------------------------------------------------------------ */
  {
    id: 'ph',
    module: 'titration.mjs',
    equation: 'pH = ½(pKa − lg c)',
    source: 'Weak-acid dissociation with the autoionisation of water neglected. '
      + 'The exact form solves a quadratic in [H⁺].',
    assumptions: [
      'The acid is weak and monoprotic, and c is far above Ka so that the '
      + 'amount dissociated is negligible against the total.',
      'Water\'s own contribution is ignored, which fails below about 1 µM.',
      'Activity coefficients are taken as 1 — the ionic strength is not asked for.',
    ],
    inputs: [
      { key: 'kind', type: 'select', unit: null, required: true, options: 'PH_KINDS' },
      { key: 'pk', type: 'number', unit: null, required: true },
      { key: 'conc', type: 'number', unit: 'molarity', required: true, min: 0, expr: true },
    ],
    outputs: [
      { key: 'ph', unit: null },
    ],
  },
  {
    id: 'buffer',
    module: 'buffer.mjs',
    equation: 'pH = pKa + lg([A⁻]/[HA])',
    source: 'Henderson–Hasselbalch, from the acid dissociation equilibrium with '
      + '[H⁺] solved for.',
    assumptions: [
      'The ratio of concentrations equals the ratio of amounts, which holds '
      + 'because both species are in the same volume.',
      'Activities are replaced by concentrations — poor above about 0.1 M, '
      + 'where a buffer\'s real pH can differ by 0.1 or more.',
      'The buffer capacity is finite: pH moves as strong acid or base is added.',
    ],
    inputs: [
      { key: 'pKa', type: 'number', unit: null, required: true },
      { key: 'targetPh', type: 'number', unit: null, required: true, min: 0, max: 14 },
      { key: 'acidConc', type: 'number', unit: 'molarity', required: true, min: 0 },
    ],
    outputs: [
      { key: 'baseConc', unit: 'molarity' },
      { key: 'ratio', unit: null },
    ],
  },

  /* ---------------------------------------------------------------------
   * Instrument readouts
   * ------------------------------------------------------------------ */
  {
    id: 'spectro',
    module: 'curve.mjs',
    equation: 'A = ε · c · l',
    source: 'Beer–Lambert law, with ε from the user\'s own calibration rather '
      + 'than a table, because ε is instrument- and wavelength-specific.',
    assumptions: [
      'The solution is dilute enough that the absorptivity is independent of '
      + 'concentration — above about A = 1.0 the calibration bends.',
      'The analyte is the only species absorbing at the chosen wavelength.',
      'The solvent blank has been subtracted.',
    ],
    inputs: [
      { key: 'mode', type: 'select', unit: null, required: true, options: 'SPECTRO_MODES' },
      { key: 'epsilon', type: 'number', unit: null, min: 0 },
      { key: 'conc', type: 'number', unit: 'molarity', min: 0, expr: true },
      { key: 'absorbance', type: 'number', unit: null, min: 0 },
      { key: 'pathCm', type: 'number', unit: 'length', min: 0 },
      { key: 'ptsText', type: 'text', unit: null },
      { key: 'reading', type: 'number', unit: null, min: 0 },
    ],
    outputs: [
      { key: 'abs', unit: null },
      { key: 'fit', unit: null, trace: true },
      { key: 'pred', unit: null, trace: true },
    ],
  },
  {
    id: 'curve',
    module: 'curve.mjs',
    equation: 'A = k·c + b',
    source: 'Least-squares regression of the calibration standards. The '
      + 'concentration of an unknown is read back by inverting the fit.',
    assumptions: [
      'The relationship is linear over the calibrated range — the fit is not '
      + 'evidence of that, and the residuals should be inspected.',
      'The unknown lies inside the calibrated range. Extrapolation past the '
      + 'highest standard is not supported by the data.',
    ],
    inputs: [
      { key: 'ptsText', type: 'text', unit: null, required: true },
      { key: 'reading', type: 'number', unit: null, required: true, min: 0 },
    ],
    outputs: [
      { key: 'fit', unit: null },
      { key: 'pred', unit: null },
    ],
  },
  {
    id: 'titrationCurve',
    module: 'titration.mjs',
    equation: 'pH = f(V) by exact charge balance',
    source: 'The full charge-balance expression, solved for [H⁺] at each added '
      + 'volume rather than using the Henderson–Hasselbalch approximation, so '
      + 'the curve is correct through the equivalence point where that '
      + 'approximation fails completely.',
    assumptions: [
      'The titrant is a strong base and the analyte a weak monoprotic acid.',
      'Activity coefficients are 1; CO₂ uptake is ignored.',
      'The equivalence point is the steepest part of the curve, not pH 7.',
    ],
    inputs: [
      { key: 'pKa', type: 'number', unit: null, required: true },
      { key: 'analyteConc', type: 'number', unit: 'molarity', required: true, min: 0 },
      { key: 'analyteVolumeMl', type: 'number', unit: 'volume', required: true, min: 0 },
      { key: 'titrantConc', type: 'number', unit: 'molarity', required: true, min: 0 },
    ],
    outputs: [
      { key: 'equivalenceMl', unit: 'volume' },
      { key: 'equivalencePh', unit: null },
    ],
  },
  {
    id: 'lab',
    module: 'lab.mjs',
    equation: 'c = n / V,  n = m / M',
    source: 'Definitional relationships between mass, amount, volume and '
      + 'concentration, solved for whichever the user leaves blank.',
    assumptions: [
      'One unknown at a time: the others must be supplied.',
      'The volume is the final solution volume, not the solvent added.',
    ],
    inputs: [
      { key: 'formula', type: 'text', unit: null },
      { key: 'massG', type: 'number', unit: 'mass', min: 0, expr: true },
      { key: 'moles', type: 'number', unit: 'amount', min: 0, expr: true },
      { key: 'volumeMl', type: 'number', unit: 'volume', min: 0, expr: true },
      { key: 'molarity', type: 'number', unit: 'molarity', min: 0, expr: true },
    ],
    outputs: [
      { key: 'massG', unit: 'mass' },
      { key: 'moles', unit: 'amount' },
      { key: 'molarity', unit: 'molarity' },
      { key: 'molarMass', unit: 'molarMass' },
    ],
  },

  /* ---------------------------------------------------------------------
   * Colligative properties
   * ------------------------------------------------------------------ */
  {
    id: 'colligative',
    module: 'colligative.mjs',
    equation: 'ΔTb = i·Kb·m   ΔTf = i·Kf·m   Π = i·c·R·T',
    source: 'The colligative laws. Kb and Kf are tabulated per solvent; R is '
      + '0.08205736608096 L·atm·mol⁻¹·K⁻¹ (CODATA 2018).',
    assumptions: [
      'The solution is ideal and dilute. Above about 0.5 mol/kg the computed '
      + 'shift is optimistic and the screen says so.',
      'i is the number of particles one formula unit gives — 2 for NaCl, 3 for '
      + 'CaCl₂, 1 for a non-electrolyte. Using 1 for a salt halves the answer.',
      'Ion pairing reduces the real i below its nominal value.',
    ],
    inputs: [
      { key: 'mode', type: 'select', unit: null, required: true, options: 'COLLIGATIVE_MODES' },
      { key: 'solvent', type: 'select', unit: null, options: 'SOLVENTS' },
      { key: 'molality', type: 'number', unit: 'molality', min: 0, expr: true },
      { key: 'molarity', type: 'number', unit: 'molarity', min: 0, expr: true },
      { key: 'i', type: 'number', unit: null, min: 0 },
      { key: 'tempC', type: 'number', unit: 'temperature', min: -273 },
      { key: 'massG', type: 'number', unit: 'mass', min: 0, expr: true },
      { key: 'solventKg', type: 'number', unit: 'mass', min: 0, expr: true },
    ],
    outputs: [
      { key: 'deltaTf', unit: null },
      { key: 'deltaTb', unit: null },
      { key: 'atm', unit: 'pressure' },
      { key: 'kPa', unit: 'pressure' },
      { key: 'osmolarity', unit: 'molarity' },
      { key: 'molarMass', unit: 'molarMass' },
    ],
  },

  /* ---------------------------------------------------------------------
   * Stoichiometry and electrochemistry
   * ------------------------------------------------------------------ */
  {
    id: 'reaction',
    module: 'reaction.mjs',
    equation: 'n = m / M,  limiting reagent by smallest n/coefficient',
    source: 'Conservation of mass and the balanced equation. The balancer solves '
      + 'the null space of the element-by-species matrix.',
    assumptions: [
      'The reaction goes to completion and the equation is the only one occurring.',
      'Coefficients are the smallest integer ratio; the balancer does not judge '
      + 'whether the reaction is real or favourable.',
      'No side products, no equilibria, no catalytic cycles.',
    ],
    inputs: [
      { key: 'equation', type: 'text', unit: null, required: true },
      { key: 'formula', type: 'text', unit: null },
      { key: 'massG', type: 'number', unit: 'mass', min: 0, expr: true },
      { key: 'moles', type: 'number', unit: 'amount', min: 0, expr: true },
    ],
    outputs: [
      { key: 'limiting', unit: null },
      { key: 'extent', unit: 'amount' },
      { key: 'percentYield', unit: null },
    ],
  },
  {
    id: 'electro',
    module: 'electro.mjs',
    equation: 'E = E° − (RT/nF)·ln Q',
    source: 'Nernst equation. F = 96485.33212 C/mol and R = 8.314462618 '
      + 'J·mol⁻¹·K⁻¹ (CODATA 2018). At 25 °C the prefactor is 0.05916 V.',
    assumptions: [
      'Standard potentials are IUPAC values against the hydrogen electrode at '
      + '1 bar, 25 °C and unit activity.',
      'Activities are replaced by concentrations, so a cell with high ionic '
      + 'strength will differ from the prediction.',
      'Liquid junction potentials are ignored.',
    ],
    inputs: [
      { key: 'e0', type: 'number', unit: 'voltage', required: true },
      { key: 'n', type: 'number', unit: null, required: true, min: 1 },
      { key: 'q', type: 'number', unit: null, required: true, min: 0 },
      { key: 'tempC', type: 'number', unit: 'temperature', min: -273 },
    ],
    outputs: [
      { key: 'e', unit: 'voltage' },
      { key: 'deltaGKJ', unit: 'molarEnergy' },
      { key: 'equilibriumK', unit: null },
      { key: 'spontaneous', unit: null },
    ],
  },
];

/** Look up a formula by id. */
export function formulaOf(id) {
  return FORMULAS.find((f) => f.id === id) ?? null;
}

/**
 * Every record key any formula can produce, input or output.
 *
 * Used by the coverage tests to assert that each one has a human label — the
 * failure this prevents is a printed report reading `massG  14.61`.
 */
export function allFieldKeys() {
  const keys = new Set();
  for (const f of FORMULAS) {
    for (const i of f.inputs) keys.add(i.key);
    for (const o of f.outputs) keys.add(o.key);
  }
  return [...keys];
}
