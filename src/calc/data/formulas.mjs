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

  /* ---------------------------------------------------------------------
   * The five analysis tabs.
   *
   * Each is a menu of eight to twelve separate calculations behind one mode
   * selector, so the equation is the *set* of relations rather than one line —
   * the same treatment `colligative` gets. Declaring only the first mode would
   * be worse than declaring nothing: the report would print one relationship
   * under a heading that claims to describe the record.
   *
   * These five were missing entirely, and the gap was invisible because the
   * absence is graceful: `Report.jsx` prints the record without its
   * 「计算方法」 section rather than failing, so a bio record looked complete
   * and simply carried no statement of what produced its numbers.
   * ------------------------------------------------------------------ */
  {
    id: 'bio',
    module: 'bio.mjs',
    equation: 'c = A₂₆₀·k/l   C₁V₁ = C₂V₂   c_oligo = A₂₆₀/(ε·l)'
      + '   t_d = t/log₂(N/N₀)   RCF = 1.118×10⁻⁵·r·rpm²'
      + '   v = V_max·[S]/(K_m+[S])',
    source: 'Beer–Lambert with the standard nucleic-acid extinction coefficients '
      + '— 50, 40 and 33 µg·mL⁻¹ per A₂₆₀ unit for dsDNA, RNA and ssDNA — from the '
      + 'molecular-biology tables (Sambrook et al.). The oligo molarity uses '
      + 'nearest-neighbour base extinction coefficients with the 0.9 hypochromicity '
      + 'correction for a single strand. C₁V₁ = C₂V₂, the doubling relation '
      + 'N = N₀·2^(t/t_d), RCF = 1.118×10⁻⁵·r·(rpm)², and the Michaelis–Menten rate law.',
    assumptions: [
      'The extinction coefficient is an average over base composition, so a '
      + 'spectrophotometric yield is an estimate — a G+C-rich sample absorbs less '
      + 'per microgram. It is always followed by a gel for this reason.',
      'The 260/280 and 260/230 ratios mean what they mean only when read in the '
      + 'same buffer as the blank; a ratio against a different blank is a different '
      + 'number.',
      'Doubling time is only meaningful for a culture in exponential phase between '
      + 'the two timepoints given. A lagging or confluent culture gives an '
      + 'arithmetic number rather than a biological one.',
      'RCF depends on the rotor radius, so an rpm quoted without one is not a '
      + 'reproducible protocol — which is why papers report RCF.',
      'K_m and V_max come from a linearised fit, and the two standard linear forms '
      + 'weight the error differently. Both are reported rather than one.',
    ],
    inputs: [
      { key: 'mode', type: 'select', unit: null, required: true, options: 'MODES' },
      { key: 'a260', type: 'number', unit: null, min: 0, expr: true },
      { key: 'a280', type: 'number', unit: null, min: 0 },
      { key: 'a230', type: 'number', unit: null, min: 0 },
      { key: 'naType', type: 'select', unit: null, options: 'NA_TYPES' },
      { key: 'pathCm', type: 'number', unit: 'length', min: 0 },
      { key: 'dilution', type: 'number', unit: null, min: 0 },
      { key: 'sequence', type: 'text', unit: null },
      { key: 'stockConc', type: 'number', unit: null, min: 0 },
      { key: 'targetConc', type: 'number', unit: null, min: 0 },
      { key: 'finalVol', type: 'number', unit: 'volume', min: 0 },
      { key: 'stockDensity', type: 'number', unit: null, min: 0 },
      { key: 'targetDensity', type: 'number', unit: null, min: 0 },
      { key: 'cultureVol', type: 'number', unit: 'volume', min: 0 },
      { key: 'cells0', type: 'number', unit: null, min: 0 },
      { key: 'cells1', type: 'number', unit: null, min: 0 },
      { key: 'hours', type: 'number', unit: 'time', min: 0 },
      { key: 'radius', type: 'number', unit: 'length', min: 0 },
      { key: 'rpm', type: 'number', unit: null, min: 0 },
      { key: 'kcat', type: 'number', unit: null, min: 0 },
      { key: 'km', type: 'number', unit: 'molarity', min: 0 },
      { key: 'points', type: 'number', unit: null, min: 0 },
    ],
    outputs: [
      { key: 'concNgPerUl', unit: 'massConcentration' },
      { key: 'concUgPerMl', unit: 'massConcentration' },
      { key: 'coefficient', unit: null },
      { key: 'ratio260280', unit: null },
      { key: 'ratio260230', unit: null },
      { key: 'verdict', unit: null },
      { key: 'sampleUl', unit: 'volume' },
      { key: 'diluentUl', unit: 'volume' },
      { key: 'totalUl', unit: 'volume' },
      { key: 'fold', unit: null },
      { key: 'nmolPerUl', unit: 'molarity' },
      { key: 'ugPerMl', unit: 'massConcentration' },
      { key: 'molarMass', unit: 'molarMass' },
      { key: 'gc', unit: null },
      { key: 'volumeUl', unit: 'volume' },
      { key: 'cellsNeeded', unit: null },
      { key: 'doublings', unit: null },
      { key: 'doublingTimeH', unit: 'time' },
      { key: 'ratePerH', unit: null },
      { key: 'rcf', unit: null },
      { key: 'rpm', unit: null },
      { key: 'k', unit: null },
      { key: 'vmax', unit: null },
      { key: 'km', unit: 'molarity' },
      { key: 'r2', unit: null },
      { key: 'points', unit: null },
      { key: 'efficiency', unit: null },
      { key: 'diffusionLimited', unit: null },
    ],
  },
  {
    id: 'uncertainty',
    module: 'uncertainty.mjs',
    equation: 'u_c(y) = √( Σ (∂f/∂xᵢ)² · u(xᵢ)² )   u(x) = a/√3',
    source: 'The GUM law of propagation of uncertainty (JCGM 100:2008). A '
      + 'tolerance stated as a bound is converted through a rectangular '
      + 'distribution, u = a/√3, per Eurachem QUAM:2012 §8.1.4. Atomic-weight '
      + 'standard uncertainties are the IUPAC 2021 abridged intervals converted '
      + 'the same way.',
    assumptions: [
      'The input quantities are independent, so the covariance terms are zero. '
      + 'Two inputs read from the same instrument would not be.',
      'A certificate tolerance is treated as a rectangular bound rather than a '
      + 'standard deviation. A manufacturer who means the latter is stating a '
      + 'larger figure, and the two are not interchangeable.',
      'Balance linearity is counted twice when a reading is a difference — tare '
      + 'plus gross — because the same error enters both readings.',
    ],
    inputs: [
      { key: 'mode', type: 'select', unit: null, required: true, options: 'MODES' },
    ],
    outputs: [
      { key: 'molarMass', unit: 'molarMass' },
      { key: 'value', unit: null },
      { key: 'conc', unit: 'molarity' },
      { key: 'unc', unit: null },
    ],
  },
  {
    id: 'stats',
    module: 'stats.mjs',
    equation: 'x̄ = Σxᵢ/n   s = √( Σ(xᵢ−x̄)²/(n−1) )'
      + '   G = |x_out − x̄|/s   Q = gap/range'
      + '   t = |x̄₁−x̄₂| / √(s₁²/n₁ + s₂²/n₂)   F = s₁²/s₂²',
    source: 'The sample standard deviation (n−1 denominator), the Grubbs and '
      + "Dixon outlier statistics with their tabulated critical values, Student's "
      + 't confidence interval, and the two-sample t and F tests. Critical values '
      + 'are computed in `distributions.mjs` from the t and F quantile functions.',
    assumptions: [
      'The data are a sample from a larger population, so the n−1 denominator is '
      + 'used. The population form would understate the spread of every result.',
      'Grubbs assumes the remaining data are roughly normal, and a single grossly '
      + 'wrong point inflates s enough to hide itself — which is why the statistic '
      + 'and the critical value are both reported rather than a verdict alone.',
      "Dixon's Q is tabulated only for small n. Outside that range the tabulated "
      + 'critical value does not apply and the screen says so.',
      'A rejection test replaces the eye with a stated rule and a stated '
      + 'confidence. Discarding a point because it "looks wrong" inflates the '
      + 'precision of what remains.',
    ],
    inputs: [
      { key: 'seriesA', type: 'text', unit: null, required: true },
      { key: 'seriesB', type: 'text', unit: null },
      { key: 'confidence', type: 'number', unit: null, min: 0, max: 100 },
    ],
    outputs: [
      { key: 'mean', unit: null },
      { key: 'sd', unit: null },
      { key: 'n', unit: null },
    ],
  },
  {
    id: 'analytical',
    module: 'analytical.mjs',
    equation: 'lg K′ = lg K − lg α_Y(H)   F = n·M_sought/M_weighed'
      + '   R = 2(t₂−t₁)/(w₁+w₂)   N = 16(t/w)²   LOD = 3.3·s_slope/slope',
    source: 'The conditional formation constant of an EDTA complex from the '
      + 'tabulated absolute constant and the acid dissociation of the ligand '
      + '(Ringbom); the redox equivalence potential from the Nernst equation; the '
      + 'gravimetric factor from the IUPAC 2021 molar masses; resolution and plate '
      + 'count from their standard definitions; and the IUPAC 3.3σ/slope detection '
      + 'limit, with the 10σ quantification limit.',
    assumptions: [
      'The conditional constant is quoted at the pH entered, and it moves sharply '
      + 'with pH: calcium is titratable at pH 10 and not at pH 5.',
      'Metal–indicator and masking equilibria are not modelled beyond the '
      + 'conditional constant, so an indicator blank is not subtracted.',
      'The detection limit uses the 3.3σ/slope convention and assumes the slope '
      + 'is known and the blank is normal. A different convention gives a '
      + 'different number from the same data.',
      'Resolution and plate count assume Gaussian peaks. A tailing peak gives a '
      + 'figure that looks acceptable and is not.',
    ],
    inputs: [
      { key: 'mode', type: 'select', unit: null, required: true, options: 'MODES' },
    ],
    outputs: [
      { key: 'conditionalLogK', unit: null },
      { key: 'sampleConc', unit: 'molarity' },
      { key: 'potential', unit: 'voltage' },
      { key: 'factor', unit: null },
      { key: 'percent', unit: null },
      { key: 'mean', unit: null },
      { key: 'recovery', unit: null },
      { key: 'lod', unit: null },
      { key: 'loq', unit: null },
      { key: 'resolution', unit: null },
      { key: 'plates', unit: null },
    ],
  },
  {
    id: 'physical',
    module: 'physical.mjs',
    equation: 'r = k·[A]ⁿ   ln k = ln A − E_a/RT   Λ = κ/c   α = Λ/Λ₀'
      + '   ΔG = ΔH − TΔS   K = exp(−ΔG/RT)',
    source: 'The integrated rate laws for zero, first and second order; the '
      + 'Arrhenius equation; molar conductivity and the Ostwald dilution law; '
      + 'ΔG = ΔH − TΔS with K = exp(−ΔG/RT); and the Kohlrausch limiting-law '
      + 'extrapolation to infinite dilution.',
    assumptions: [
      'The reaction order is determined from the data rather than assumed — all '
      + 'three linearised forms are fitted and the straightest wins, and the '
      + 'residuals are shown so a systematic curve stays visible.',
      'The Arrhenius fit assumes E_a is constant over the temperature range. A '
      + 'curved Arrhenius plot means it is not.',
      'Kohlrausch extrapolation holds for strong electrolytes at low '
      + 'concentration; at high concentration the limiting law fails.',
      'ΔG and K are standard-state values. The direction at the working '
      + 'concentrations needs the reaction quotient, which the electrochemistry '
      + 'tab computes.',
    ],
    inputs: [
      { key: 'mode', type: 'select', unit: null, required: true, options: 'MODES' },
    ],
    outputs: [
      { key: 'order', unit: null },
      { key: 'k', unit: null },
      { key: 'r2', unit: null },
      { key: 'EaKJ', unit: 'molarEnergy' },
      { key: 'lambda', unit: null },
      { key: 'alpha', unit: null },
      { key: 'deltaG', unit: 'molarEnergy' },
      { key: 'K', unit: null },
      { key: 'eutecticC', unit: 'temperature' },
      { key: 'xA', unit: null },
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
