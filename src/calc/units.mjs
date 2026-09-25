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
 * ## Everything is derived
 *
 * The tables below (`DIMENSIONS`, `EXPONENTS`, `UNITS`) are **computed from
 * `data/dimensions.mjs`**, not written by hand. That file is the single source
 * of truth; this one is the API the rest of the app imports.
 *
 * The first version had the three tables written out separately, and adding
 * one unit meant editing one of them while adding one dimension meant editing
 * all three — with nothing stopping them from disagreeing. Three tests existed
 * purely to catch those disagreements, which is the tell: an invariant that
 * needs a test to hold is an invariant the shape should have made impossible.
 * Now a dimension declares its base, its vector and its units in one object,
 * and cannot be half-declared.
 *
 * The tables are still exported because they are the API the expression
 * evaluator and the converter already use, and because a derived table is
 * still a table — reading `UNITS.g.factor` is clearer than walking the
 * registry at every call site.
 *
 * Pure data and arithmetic, no I/O.
 */

import { fail, requireFinite } from './errors.mjs';
import { REGISTRY } from './data/dimensions.mjs';

/* ==========================================================================
   Derived tables
   ========================================================================== */

/**
 * The base unit of each dimension, and how it is written.
 *
 * The base is a choice, not a fact: grams rather than kilograms because every
 * bench quantity is in grams or below, and litres rather than cubic metres for
 * the same reason. Picking the unit a user reaches for first keeps the factors
 * near 1 and the rounding error small.
 */
export const DIMENSIONS = Object.fromEntries(
  REGISTRY.map((d) => [d.id, { base: d.base, siBase: d.siBase, label: d.label, note: d.note, affine: !!d.affine, expr: d.expr !== false }]),
);

/**
 * The dimensional exponent vector of each dimension, as [M, L, T, N, I, K].
 *
 * This is what makes `5 g / 250 mL` computable rather than merely convertible:
 * dividing is subtracting the exponents, so a mass over a volume is a
 * concentration by construction rather than by a special case.
 *
 * Dimensions with `exp: null` are excluded — see the note on `ratio` and
 * `angle` in the registry. Including them as all-zeroes would make every plain
 * number look like an angle.
 */
export const EXPONENTS = Object.fromEntries(
  REGISTRY.filter((d) => d.exp !== null).map((d) => [d.id, d.exp]),
);

/**
 * Symbols that mean two different things, and which one an *expression* means.
 *
 * These collisions are not a defect in the registry — they are the state of the
 * world. `A` is both the ampere and the ångström, `C` is both the coulomb and
 * degrees Celsius, `N` is both the newton and normality. No amount of table
 * tidying makes them go away.
 *
 * What *would* be a defect is guessing silently. So the ambiguity is declared
 * here, in one place, with the reasoning for each resolution — and the
 * converter is unaffected, because it lists units per dimension from the
 * registry and a user who has picked "length" cannot be shown the ampere.
 *
 * Only the expression evaluator needs one answer per symbol, because it sees a
 * bare token with no dimension context.
 */
const EXPR_PREFERRED = {
  // The SI base unit wins: a bare `A` in an arithmetic expression is an
  // ampere. Ångström is reached by typing `Å` or the word, and is offered
  // normally in the converter.
  A: 'current',
  // Temperature is already special-cased before this table is consulted
  // (`dimensionOf` checks `TEMPERATURE_UNITS` first), and neither is legal in
  // an expression anyway — a temperature has an offset, so the parser refuses
  // it. Listed for completeness rather than because it is reachable.
  C: 'temperature',
  F: 'temperature',
  // A bare `N` is the newton. Normality is a concentration and is spelled out
  // in the converter.
  N: 'force',
  // The dalton is one unit, declared once. It appears in the mass dimension;
  // the molar-mass entry was the same physical unit written twice.
  Da: 'mass',
  // Identical factors (1/60 s⁻¹), so the resolution cannot change a result.
  rpm: 'frequency',
  // A chemist writing `ppm` in an expression means a concentration. The
  // dimensionless reading is available in the converter's ratio dimension.
  ppm: 'massConcentration',
  ppb: 'massConcentration',
  ppt: 'massConcentration',
  // Neither is legal in an expression (both dimensions are `expr: false`), so
  // this only decides what the global table points at.
  rad: 'dose',
};

/**
 * Every unit, as a factor to its dimension's **SI** base unit.
 *
 * SI, not the unit the value is displayed in. The two differ for mass (kg
 * against g), volume (m³ against L) and the concentrations, and mixing them is
 * how `1 atm * 1 L` came out a thousand times too large: the exponents compose
 * in m³, so the litre factor has to be applied once, at the end, by
 * `displayFactor` — not baked into the unit's own scale.
 *
 * Alternative spellings (`µg`, `ml`, `Ω`) are registered as **aliases pointing
 * at the same entry**, not as separate units. A user typing `µg` and a user
 * typing `ug` mean the same quantity, and treating them as two units would put
 * both in the picker and let them convert against each other.
 */
export const UNITS = (() => {
  const out = {};
  const declared = new Map();   // symbol -> dimension that claimed it
  const clashes = new Map();    // symbol -> [dimensions]

  const claim = (sym, entry) => {
    const prior = declared.get(sym);
    if (prior === undefined) {
      declared.set(sym, entry.dim);
      out[sym] = entry;
      return;
    }
    if (prior === entry.dim) return;   // same dimension, same symbol: harmless
    const list = clashes.get(sym) ?? [prior];
    if (!list.includes(entry.dim)) list.push(entry.dim);
    clashes.set(sym, list);
    // A declared preference wins; otherwise the first declaration stands and
    // the collision is reported below.
    if (EXPR_PREFERRED[sym] === entry.dim) out[sym] = entry;
  };

  for (const dim of REGISTRY) {
    for (const u of dim.units) {
      const entry = { dim: dim.id, factor: u.factor, sym: u.sym, name: u.name };
      claim(u.sym, entry);
      for (const alias of u.aka ?? []) claim(alias, entry);
    }
  }

  // Every collision must be resolved deliberately. A new one added without a
  // decision here is a silent wrong answer — `5 N` would mean whatever the
  // registry happened to list first — so this throws at load instead.
  const unresolved = [...clashes.keys()].filter((s) => !(s in EXPR_PREFERRED));
  if (unresolved.length) {
    throw new Error(`ambiguous unit symbols need an EXPR_PREFERRED entry: ${unresolved.join(', ')}`);
  }

  return out;
})();

/** Symbols that mean more than one thing, for the UI to warn about. */
export const AMBIGUOUS_SYMBOLS = Object.keys(EXPR_PREFERRED);

/**
 * Temperature, which does not convert by a factor.
 *
 * Every other unit scales from its base by multiplication. Temperature has an
 * offset: 0 °C is 273.15 K, not 0 K. A factor table cannot express that, and
 * fitting it into one would make `convert(0, 'C', 'K')` return 0 — a wrong
 * answer that looks like a right one, which is the worst kind.
 *
 * So temperature is a separate table of affine maps, and `convert` routes to
 * it by dimension.
 */
export const TEMPERATURE_UNITS = {
  K: { toBase: (v) => v, fromBase: (v) => v },
  C: { toBase: (v) => v + 273.15, fromBase: (v) => v - 273.15 },
  F: { toBase: (v) => (v + 459.67) * (5 / 9), fromBase: (v) => v * (9 / 5) - 459.67 },
  R: { toBase: (v) => v * (5 / 9), fromBase: (v) => v * (9 / 5) },
};

/* ==========================================================================
   Lookups
   ========================================================================== */

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

/**
 * Every unit symbol, in the order a picker should offer them.
 *
 * Canonical symbols only — the aliases resolve through `UNITS` but are not
 * listed, because a picker offering both `ug` and `µg` as separate rows is
 * offering one unit twice.
 */
export const UNIT_SYMBOLS = REGISTRY.flatMap((d) => d.units.map((u) => u.sym));

/** Every dimension key, in registry order. */
export const DIMENSION_KEYS = REGISTRY.map((d) => d.id);

/** The units of one dimension, in table order. */
export function unitsOf(dimension) {
  const spec = REGISTRY.find((d) => d.id === dimension);
  if (!spec) return [];
  return spec.units.map((u) => u.sym);
}

/**
 * Which dimension a unit belongs to, or null if it is not a unit.
 *
 * A null rather than a throw: this is used to decide whether a token in an
 * expression is a unit, where "not a unit" is an ordinary answer and an
 * exception would be control flow.
 *
 * ## The `within` hint
 *
 * Ten symbols mean two things — `A` is ampere and ångström, `N` is newton and
 * normality. A bare lookup has to pick one, and `EXPR_PREFERRED` picks for the
 * expression evaluator, which sees a token with no context.
 *
 * The converter *does* have context: the user picked a dimension before
 * picking a unit. Passing it here lets ångström resolve as a length when the
 * user is converting lengths, while a bare `A` in an expression still resolves
 * as an ampere. Without the hint the converter would refuse to convert a unit
 * it had just offered in its own list.
 */
export function dimensionOf(unit, within = null) {
  if (within !== null) {
    const spec = REGISTRY.find((d) => d.id === within);
    if (spec?.units.some((u) => u.sym === unit || (u.aka ?? []).includes(unit))) return within;
    if (within === 'temperature' && unit in TEMPERATURE_UNITS) return 'temperature';
  }
  // Temperature next: `C` and `F` are also the coulomb and the faraday, and
  // the temperature reading is the one a user typing `25 C` means. Checked
  // before the collision table because this function is the public entry point
  // and must not depend on that table's ordering.
  if (unit in TEMPERATURE_UNITS) return 'temperature';
  return UNITS[unit]?.dim ?? null;
}

/* ==========================================================================
   Conversion
   ========================================================================== */

/**
 * Convert within one dimension.
 *
 * Throws rather than returning null for the two things that are genuinely
 * errors: an unknown symbol, and a cross-dimension request. A cross-dimension
 * conversion is not a hard case that needs a density — it is a question that
 * has no answer, and returning a number for it would be a lie.
 */
export function convert(value, from, to, within = null) {
  requireFinite(value, 'value');
  // The dimension hint disambiguates the ten symbols that mean two things —
  // `A` is ampere and ångström, and a user converting lengths means the
  // second. Falls back to the bare reading when no hint is given, which is
  // what a caller outside the converter wants.
  const dimA = dimensionOf(from, within);
  const dimB = dimensionOf(to, within);
  if (dimA === null) fail('unknownUnit', { unit: from });
  if (dimB === null) fail('unknownUnit', { unit: to });
  if (dimA !== dimB) fail('incompatibleUnits', { from, to, fromDim: dimA, toDim: dimB });

  if (dimA === 'temperature') {
    return TEMPERATURE_UNITS[from].toBase
      ? TEMPERATURE_UNITS[to].fromBase(TEMPERATURE_UNITS[from].toBase(value))
      : fail('unknownUnit', { unit: from });
  }

  const a = UNITS[from];
  const b = UNITS[to];
  // Resolve through the hinted dimension when the bare table points elsewhere:
  // `A` as a length is not the entry `UNITS.A` holds.
  const factorA = a?.dim === dimA ? a.factor : unitFactor(dimA, from);
  const factorB = b?.dim === dimB ? b.factor : unitFactor(dimB, to);
  if (factorA === null) fail('unknownUnit', { unit: from });
  if (factorB === null) fail('unknownUnit', { unit: to });
  return (value * factorA) / factorB;
}

/** The factor of a unit read strictly within one dimension. */
function unitFactor(dimension, symbol) {
  const spec = REGISTRY.find((d) => d.id === dimension);
  const u = spec?.units.find((x) => x.sym === symbol || (x.aka ?? []).includes(symbol));
  return u?.factor ?? null;
}

/**
 * The dimension that contains both symbols, or null if none does.
 *
 * For a caller with no dimension context — the calculator's `25 C -> K` arrow
 * form, where the user typed both sides and there is no picker to consult.
 * The bare lookup would resolve `rad` as the absorbed dose and `deg` as an
 * angle, then refuse a conversion that is obviously the intended one.
 *
 * Both symbols must be in the *same* dimension, so this cannot paper over a
 * genuine mismatch: `g -> mL` matches no dimension and still fails.
 */
export function sharedDimension(a, b) {
  for (const spec of REGISTRY) {
    const has = (sym) => spec.units.some((u) => u.sym === sym || (u.aka ?? []).includes(sym));
    if (has(a) && has(b)) return spec.id;
  }
  return null;
}

/* ==========================================================================
   Exponent algebra
   ========================================================================== */

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
  const exp = EXPONENTS[dim];
  if (!exp) fail('unitNotInExpressions', { unit: unitOrDimension });
  return exp;
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

/** Exponent labels, in vector order, for naming a derived dimension. */
const EXPONENT_LABELS = ['M', 'L', 'T', 'N', 'I', 'K'];

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
