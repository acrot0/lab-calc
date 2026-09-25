/**
 * Units, dimensions, and conversion.
 *
 * Two things live here that are easy to confuse:
 *
 *   - A **dimension** is what kind of quantity something is: mass, volume,
 *     time. Two values can be added only if they share one.
 *   - A **unit** is how a quantity is expressed: grams and kilograms are both
 *     mass, so they convert by a factor.
 *
 * Every unit is stored as a factor to its dimension's base unit, which is what
 * makes conversion one division. Temperature is the exception and is handled
 * separately — see `TEMPERATURE_UNITS`.
 *
 * The dimensions are the ones a bench chemist actually meets. Length and time
 * are here because they appear inside other quantities rather than because
 * anyone converts kilometres on this screen.
 *
 * Pure data and arithmetic, no I/O.
 */

import { fail, requireFinite } from './errors.mjs';

/**
 * The base unit of each dimension, and how it is written.
 *
 * The base is a choice, not a fact: grams rather than kilograms because every
 * bench quantity is in grams or below, and litres rather than cubic metres for
 * the same reason. Picking the unit a user would reach for first keeps the
 * factors near 1 and the rounding error small.
 */
export const DIMENSIONS = {
  mass: { base: 'g' },
  volume: { base: 'L' },
  amount: { base: 'mol' },
  // Molarity and mass-per-volume are NOT one dimension with two scales. They
  // are two dimensions that happen to share a name in the UI: mol/L is
  // [0,-3,0,1,0,0] and g/L is [1,-3,0,0,0,0]. Treating them as one dimension
  // with a "family" tag looked tidier and was wrong — it let a factor table
  // claim both had factor 1 against a single base, which is only true of one
  // of them.
  molarity: { base: 'M' },
  massConcentration: { base: 'g/L' },
  length: { base: 'm' },
  area: { base: 'm2' },
  time: { base: 's' },
  temperature: { base: 'K' },
  pressure: { base: 'Pa' },
  energy: { base: 'J' },
  voltage: { base: 'V' },
  resistance: { base: 'ohm' },
  current: { base: 'A' },
};

/**
 * The dimensional exponent vector of each dimension, as [M, L, T, N, I, K].
 *
 * This is what makes `5 g / 250 mL` computable rather than merely convertible:
 * dividing is subtracting the exponents, so a mass over a volume is a
 * concentration by construction rather than by a special case. The vectors
 * above were chosen to be consistent with these — mass is [1,0,0,0,0,0] and
 * volume is [0,3,0,0,0,0], so their difference is [1,-3,0,0,0,0], which is
 * exactly the concentration vector.
 */
export const EXPONENTS = {
  mass: [1, 0, 0, 0, 0, 0],
  volume: [0, 3, 0, 0, 0, 0],
  amount: [0, 0, 0, 1, 0, 0],
  molarity: [0, -3, 0, 1, 0, 0],
  massConcentration: [1, -3, 0, 0, 0, 0],
  length: [0, 1, 0, 0, 0, 0],
  area: [0, 2, 0, 0, 0, 0],
  time: [0, 0, 1, 0, 0, 0],
  temperature: [0, 0, 0, 0, 0, 1],
  pressure: [1, -1, -2, 0, 0, 0],
  energy: [1, 2, -2, 0, 0, 0],
  voltage: [1, 2, -3, 0, -1, 0],
  resistance: [1, 2, -3, 0, -2, 0],
  current: [0, 0, 0, 0, 1, 0],
};

/** Exponent labels, in vector order, for naming a derived dimension. */
const EXPONENT_LABELS = ['M', 'L', 'T', 'N', 'I', 'K'];

/**
 * Every unit, as a factor to its dimension's **SI** base unit.
 *
 * SI, not the unit the value is displayed in. The two differ for mass (kg
 * against g), volume (m3 against L) and the two concentrations, and mixing them
 * is how `1 atm * 1 L` came out a thousand times too large: the exponents
 * compose in m3, so the litre factor has to be applied once, at the end, by
 * `displayFactor` — not baked into the unit's own scale.
 *
 * One flat table rather than one per dimension: the dimension is derivable from
 * the key, so a second table would be a place for the two to disagree.
 *
 * The prefixes are the SI ones plus the lab conventions: `u` for micro rather
 * than `µ`, because the key is typed into a text field and a user with a US
 * keyboard cannot produce `µ`.
 */
export const UNITS = {
  // --- mass, SI base kg ---
  kg: { dim: 'mass', factor: 1 },
  g: { dim: 'mass', factor: 1e-3 },
  mg: { dim: 'mass', factor: 1e-6 },
  ug: { dim: 'mass', factor: 1e-9 },
  ng: { dim: 'mass', factor: 1e-12 },
  pg: { dim: 'mass', factor: 1e-15 },
  lb: { dim: 'mass', factor: 0.45359237 },
  oz: { dim: 'mass', factor: 0.028349523125 },

  // --- volume, SI base m3 ---
  m3: { dim: 'volume', factor: 1 },
  L: { dim: 'volume', factor: 1e-3 },
  dL: { dim: 'volume', factor: 1e-4 },
  cL: { dim: 'volume', factor: 1e-5 },
  mL: { dim: 'volume', factor: 1e-6 },
  uL: { dim: 'volume', factor: 1e-9 },
  nL: { dim: 'volume', factor: 1e-12 },
  pL: { dim: 'volume', factor: 1e-15 },
  cm3: { dim: 'volume', factor: 1e-6 },
  // The imperial volumes. A US gallon is 3.785411784 L by definition and an
  // imperial gallon is 4.54609 L; they are not the same and a lab in the UK
  // using "gallon" means the second.
  gal: { dim: 'volume', factor: 3.785411784e-3 },
  galUK: { dim: 'volume', factor: 4.54609e-3 },
  qt: { dim: 'volume', factor: 9.46352946e-4 },
  pt: { dim: 'volume', factor: 4.73176473e-4 },
  floz: { dim: 'volume', factor: 2.95735295625e-5 },
  tbsp: { dim: 'volume', factor: 1.478676478125e-5 },
  tsp: { dim: 'volume', factor: 4.92892159375e-6 },
  cup: { dim: 'volume', factor: 2.365882365e-4 },

  // --- amount, base mol ---
  mol: { dim: 'amount', factor: 1 },
  mmol: { dim: 'amount', factor: 1e-3 },
  umol: { dim: 'amount', factor: 1e-6 },
  nmol: { dim: 'amount', factor: 1e-9 },
  pmol: { dim: 'amount', factor: 1e-12 },

  // --- molarity, SI base mol/m3 ---
  // 1 M is 1 mol/L, which is 1000 mol/m3 — so M is the *larger* unit and its
  // factor is 1000, not 1. Getting this backwards made every molarity out by
  // three orders of magnitude.
  M: { dim: 'molarity', factor: 1e3 },
  mM: { dim: 'molarity', factor: 1 },
  uM: { dim: 'molarity', factor: 1e-3 },
  nM: { dim: 'molarity', factor: 1e-6 },
  pM: { dim: 'molarity', factor: 1e-9 },
  // --- mass concentration, SI base kg/m3 ---
  // A mass over a volume. `%w/v` and ppm are here because that is what they
  // are: 1 %w/v is 1 g per 100 mL, and 1 ppm is 1 mg/L.
  //
  // 1 g/L is 1e-3 kg / 1e-3 m3, which is exactly 1 kg/m3 — so g/L and mg/mL
  // are the same unit and share a factor, which is not a coincidence but the
  // reason both are common on a bench.
  'g/L': { dim: 'massConcentration', factor: 1 },
  'mg/L': { dim: 'massConcentration', factor: 1e-3 },
  'ug/L': { dim: 'massConcentration', factor: 1e-6 },
  'ng/L': { dim: 'massConcentration', factor: 1e-9 },
  'mg/mL': { dim: 'massConcentration', factor: 1 },
  'ug/mL': { dim: 'massConcentration', factor: 1e-3 },
  'g/dL': { dim: 'massConcentration', factor: 10 },
  'mg/dL': { dim: 'massConcentration', factor: 1e-2 },
  'ug/dL': { dim: 'massConcentration', factor: 1e-5 },
  '%w/v': { dim: 'massConcentration', factor: 10 },
  ppm: { dim: 'massConcentration', factor: 1e-3 },
  ppb: { dim: 'massConcentration', factor: 1e-6 },

  // --- length, base m ---
  km: { dim: 'length', factor: 1e3 },
  m: { dim: 'length', factor: 1 },
  dm: { dim: 'length', factor: 0.1 },
  cm: { dim: 'length', factor: 0.01 },
  mm: { dim: 'length', factor: 1e-3 },
  um: { dim: 'length', factor: 1e-6 },
  nm: { dim: 'length', factor: 1e-9 },
  pm: { dim: 'length', factor: 1e-12 },
  // Ångström is not an SI unit but it is the unit bond lengths are quoted in,
  // and a chemistry tool that makes you convert to nanometres is a tool that
  // gets put down.
  A: { dim: 'length', factor: 1e-10 },
  in: { dim: 'length', factor: 0.0254 },
  ft: { dim: 'length', factor: 0.3048 },
  yd: { dim: 'length', factor: 0.9144 },
  mi: { dim: 'length', factor: 1609.344 },
  nmi: { dim: 'length', factor: 1852 },

  // --- area, base m2 ---
  // A length squared, given its own dimension entry so a bare `m2` names
  // something and `4 m2 ^ 0.5` can report a length. The exponent vector is
  // still the thing that does the arithmetic.
  m2: { dim: 'area', factor: 1 },
  cm2: { dim: 'area', factor: 1e-4 },
  mm2: { dim: 'area', factor: 1e-6 },

  // --- time, base s ---
  s: { dim: 'time', factor: 1 },
  ms: { dim: 'time', factor: 1e-3 },
  us: { dim: 'time', factor: 1e-6 },
  ns: { dim: 'time', factor: 1e-9 },
  min: { dim: 'time', factor: 60 },
  h: { dim: 'time', factor: 3600 },
  d: { dim: 'time', factor: 86400 },

  // --- pressure, base Pa ---
  Pa: { dim: 'pressure', factor: 1 },
  kPa: { dim: 'pressure', factor: 1e3 },
  MPa: { dim: 'pressure', factor: 1e6 },
  hPa: { dim: 'pressure', factor: 100 },
  bar: { dim: 'pressure', factor: 1e5 },
  mbar: { dim: 'pressure', factor: 100 },
  atm: { dim: 'pressure', factor: 101325 },
  mmHg: { dim: 'pressure', factor: 133.322387415 },
  torr: { dim: 'pressure', factor: 133.322368421 },
  psi: { dim: 'pressure', factor: 6894.757293168 },

  // --- energy, base J ---
  J: { dim: 'energy', factor: 1 },
  kJ: { dim: 'energy', factor: 1e3 },
  mJ: { dim: 'energy', factor: 1e-3 },
  cal: { dim: 'energy', factor: 4.184 },
  kcal: { dim: 'energy', factor: 4184 },
  Wh: { dim: 'energy', factor: 3600 },
  kWh: { dim: 'energy', factor: 3.6e6 },
  eV: { dim: 'energy', factor: 1.602176634e-19 },

  // --- voltage, base V ---
  V: { dim: 'voltage', factor: 1 },
  mV: { dim: 'voltage', factor: 1e-3 },
  uV: { dim: 'voltage', factor: 1e-6 },
  kV: { dim: 'voltage', factor: 1e3 },

  // --- resistance, base ohm ---
  ohm: { dim: 'resistance', factor: 1 },
  kohm: { dim: 'resistance', factor: 1e3 },
  Mohm: { dim: 'resistance', factor: 1e6 },
  mohm: { dim: 'resistance', factor: 1e-3 },

  // --- current, base A ---
  A: { dim: 'current', factor: 1 },
  mA: { dim: 'current', factor: 1e-3 },
  uA: { dim: 'current', factor: 1e-6 },
  nA: { dim: 'current', factor: 1e-9 },
};

/**
 * Temperature, which does not convert by a factor.
 *
 * Every other unit scales from its base by multiplication. Temperature has an
 * offset: 0 °C is 273.15 K, not 0 K. A factor table cannot express that, and
 * fitting it into one would make `unitConvert(0, 'C', 'K')` return 0 — a wrong
 * answer that looks like a right one, which is the worst kind.
 *
 * So temperature is a separate table of affine maps, and `unitConvert` routes
 * to it by dimension.
 */
export const TEMPERATURE_UNITS = {
  K: { toBase: (v) => v, fromBase: (v) => v },
  C: { toBase: (v) => v + 273.15, fromBase: (v) => v - 273.15 },
  F: { toBase: (v) => (v + 459.67) * (5 / 9), fromBase: (v) => v * (9 / 5) - 459.67 },
  R: { toBase: (v) => v * (5 / 9), fromBase: (v) => v * (9 / 5) },
};

/**
 * The factor from a dimension's SI base to the unit it is displayed in.
 *
 * `evaluate` composes in SI and divides by this before reporting. For mass that
 * is 1e-3 — a result in kilograms becomes grams — and for most dimensions it is
 * 1, because the display base and the SI base are the same unit.
 */
export function displayFactor(dimension) {
  const spec = DIMENSIONS[dimension];
  if (!spec || dimension === 'temperature') return 1;
  return UNITS[spec.base]?.factor ?? 1;
}

/** Every unit symbol, in the order a picker should offer them. */
export const UNIT_SYMBOLS = Object.keys(UNITS);

/** Every dimension key. */
export const DIMENSION_KEYS = Object.keys(DIMENSIONS);

/** The units of one dimension, in table order. */
export function unitsOf(dimension) {
  if (dimension === 'temperature') return Object.keys(TEMPERATURE_UNITS);
  return UNIT_SYMBOLS.filter((u) => UNITS[u].dim === dimension);
}

/**
 * Which dimension a unit belongs to, or null if it is not a unit.
 *
 * A null rather than a throw: this is used to decide whether a token in an
 * expression is a unit, where "not a unit" is an ordinary answer and an
 * exception would be control flow.
 */
export function dimensionOf(unit) {
  if (unit in TEMPERATURE_UNITS) return 'temperature';
  return UNITS[unit]?.dim ?? null;
}

/**
 * Convert within one dimension.
 *
 * Throws rather than returning null for the two things that are genuinely
 * errors: an unknown symbol, and a cross-dimension request. A cross-dimension
 * conversion is not a hard case that needs a density — it is a question that
 * has no answer, and returning a number for it would be a lie.
 */
export function convert(value, from, to) {
  requireFinite(value, 'value');
  const dimA = dimensionOf(from);
  const dimB = dimensionOf(to);
  if (dimA === null) fail('unknownUnit', { unit: from });
  if (dimB === null) fail('unknownUnit', { unit: to });
  if (dimA !== dimB) fail('incompatibleUnits', { from, to, fromDim: dimA, toDim: dimB });

  if (dimA === 'temperature') {
    return TEMPERATURE_UNITS[to].fromBase(TEMPERATURE_UNITS[from].toBase(value));
  }

  return (value * UNITS[from].factor) / UNITS[to].factor;
}

/**
 * The exponent vector of a unit or of a written dimension.
 *
 * Accepts both because the expression evaluator has one of each: a parsed unit
 * symbol, and a dimension name it derived from dividing two of them.
 */
export function exponentsOf(unitOrDimension) {
  if (unitOrDimension in EXPONENTS) return EXPONENTS[unitOrDimension];
  const dim = dimensionOf(unitOrDimension);
  if (dim === null) fail('unknownUnit', { unit: unitOrDimension });
  return EXPONENTS[dim];
}

/** Add two exponent vectors, componentwise. */
export function addExponents(a, b) {
  return a.map((x, i) => x + b[i]);
}

/** Subtract two exponent vectors, componentwise. */
export function subtractExponents(a, b) {
  return a.map((x, i) => x - b[i]);
}

/**
 * The dimension name for an exponent vector, or null if it is not one this
 * project knows.
 *
 * Used to name the result of `g / L`: the vector is looked up rather than the
 * operation being special-cased, so `mol / L` and `g / mL` resolve through the
 * same path.
 */
export function dimensionFromExponents(exp) {
  for (const [dim, known] of Object.entries(EXPONENTS)) {
    if (known.every((x, i) => x === exp[i])) return dim;
  }
  return null;
}

/**
 * The dimension name for an exponent vector, written out.
 *
 * Falls back to a composed name rather than null: a derived dimension the table
 * has no entry for is still expressible, and refusing to name it would make the
 * calculator fail on a correct intermediate result. `M·L-3` is ugly but it is
 * true, and it is what a student would write.
 */
export function nameExponents(exp) {
  const known = dimensionFromExponents(exp);
  if (known) return known;
  const parts = exp
    .map((x, i) => (x === 0 ? null : `${EXPONENT_LABELS[i]}${x === 1 ? '' : x}`))
    .filter(Boolean);
  return parts.length ? parts.join('·') : 'dimensionless';
}

/** Whether an exponent vector is all zeroes. */
export function isDimensionless(exp) {
  return exp.every((x) => x === 0);
}
