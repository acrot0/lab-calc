import { hasProcedure } from './procedure.mjs';
import { CalcError } from '../calc/errors.mjs';
import { stockFromSolid, dilution } from '../calc/solution.mjs';
import { bufferRecipe, dilutionSeries } from '../calc/buffer.mjs';

/*
 * Batch scaling: re-make a saved preparation at another size.
 *
 * ## Why this exists
 *
 * A record saved at 500 mL could only be re-made at 250 mL by re-typing every
 * field. The competitor survey found batch scaling in most tools that do
 * preparation work — Lab.Hacks, the hydroponics calculators, and the PCR
 * master-mix tools, which express it as "24 reactions × 1.1 = prepare for 27".
 * This app had no way to do it at all.
 *
 * ## The rule that makes it safe: scale amounts, never concentrations
 *
 * Doubling a recipe doubles the mass and the volume. The molarity is the
 * *target*, not an amount, and doubling it would turn a 0.5 M solution into a
 * 1 M one that still looks like the record it came from — a silent corruption
 * with no field showing anything wrong.
 *
 * The distinction is not a name list. `molarity`, `conc`, `percent` and the
 * like are concentrations; `volumeMl`, `massG`, `stockVolumeMl` are amounts.
 * Rather than enumerate every field of every tab (which would go stale the
 * first time a tab was added), the rule is stated once, below, and the tests
 * pin the cases that matter.
 */

/**
 * The factors offered, and the reason for exactly these.
 *
 * Bench work moves in doublings and halvings — half a batch, a double batch —
 * and the two quarter/tenfold steps cover "a small trial" and "a stock of
 * ten". A continuous slider was rejected: a recipe at ×3.7 is not a thing
 * anyone asks for, and every extra value is one more chance to mis-tap.
 */
export const SCALE_FACTORS = Object.freeze([0.25, 0.5, 2, 5, 10]);

/**
 * Field names that are concentrations rather than amounts.
 *
 * Matched case-insensitively against the whole key. Every one of these says
 * "what the solution is", not "how much of it there is" — scaling any of them
 * changes the recipe instead of its size.
 *
 * ## Why the first version of this was wrong
 *
 * It was an anchored alternation, `/^(molarity|conc|concentration|...)$/`, and
 * the end-to-end test caught what that misses: a dilution's `stockConc` does
 * not match `^conc$`, so it was scaled — and scaling it turned a 1 → 0.1
 * dilution into a 0.5 → 0.1 one. The fold factor moved from 10 to 5 and the
 * solution was no longer the same solution. Nothing in the scaled object looks
 * wrong; only running the calculator shows it.
 *
 * So the match is on a **substring**, and the vocabulary is broader: anything
 * ending in `Conc` or containing `molar` / `normal` / `percent` is a
 * concentration whatever it is prefixed with — `stockConc`, `targetConc`,
 * `finalConcentration`, `stockMolarity`.
 *
 * `ph` and `pka` are anchored, deliberately: they are two letters that appear
 * inside ordinary words, and a substring match would leave `alpha` and
 * `phases` unscaled. They are in the list for a subtler reason than the rest —
 * pH is logarithmic, so scaling it would be meaningless as well as wrong.
 */
const CONCENTRATION_PATTERN = /conc|molar|molal|normal|percent/i;
const CONCENTRATION_EXACT = /^(ph|pka|pkb|density|temperature|c)$/i;

/** Whether a key names a concentration, and so must not be scaled. */
function isConcentrationKey(key) {
  const k = String(key ?? '');
  return CONCENTRATION_EXACT.test(k) || CONCENTRATION_PATTERN.test(k);
}

/**
 * The keys scaling will leave alone, in the order they appear.
 *
 * The menu names them, because "concentration unchanged" is a claim the user
 * has to be able to check: a field that visibly does not change on a control
 * labelled "×2" reads as a bug unless the reason is on screen.
 */
export function preservedKeys(inputs) {
  return Object.keys(inputs && typeof inputs === 'object' ? inputs : {})
    .filter((k) => typeof inputs[k] === 'number' && Number.isFinite(inputs[k]))
    .filter(isConcentrationKey);
}

/**
 * Round a scaled amount so it does not carry binary-floating-point noise.
 *
 * `0.1 * 3` is `0.30000000000000004` and `500 * 0.25` is exact only by luck.
 *
 * **Six** significant figures, not twelve. Twelve was the first attempt and it
 * failed the test that asked for a sane number of decimals: `0.1 × 1/3` came
 * back as `0.0333333333333`, which is twelve significant figures but fifteen
 * characters. Significant figures are the wrong lens for "is this readable" —
 * what matters is that the digits stop where measurement stops.
 *
 * Six is chosen against the instruments rather than picked round: the balances
 * this app models read to 0.1 mg, so a 100 g batch is known to 7 significant
 * figures at the very most, and every flask and pipette in the tolerance
 * tables is coarser still. Six digits never discards a real measurement, and
 * it turns the repeating decimals that division produces into something a
 * person can read off a screen.
 *
 * `toPrecision` returns a string with trailing zeros for a value like 125, so
 * the result is re-read as a number — `Number('125.000')` is 125, and the
 * zeros were a formatting artifact rather than a magnitude.
 */
function tidy(n) {
  if (!Number.isFinite(n)) return n;
  return Number(n.toPrecision(6));
}

/**
 * Scale every amount in a record's inputs by `factor`.
 *
 * Returns a new object; the input is never mutated, because the caller holds
 * it as the original record's `inputs` and a mutation would rewrite history.
 *
 * Concentrations are copied through unchanged. Non-numeric values — a blank
 * field, a formula string, a null — are copied through as they are: a saved
 * record routinely holds a half-filled field, and scaling must not turn a
 * blank into a zero.
 *
 * Throws `CalcError` for a factor that is not a positive finite number. Zero
 * and negatives produce amounts that are zero or nonsense, and a record that
 * looks real but is not is worse than a refusal.
 */
export function scaleInputs(inputs, factor) {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new CalcError('scaleFactorInvalid', { value: factor });
  }
  const src = inputs && typeof inputs === 'object' ? inputs : {};
  const out = {};
  for (const [key, value] of Object.entries(src)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      out[key] = value;
      continue;
    }
    if (isConcentrationKey(key)) {
      out[key] = value;
      continue;
    }
    out[key] = tidy(value * factor);
  }
  return out;
}

/**
 * Whether a record of this kind can be scaled.
 *
 * Gated on the same registry the procedure steps use, so the two cannot drift:
 * a kind that has bench steps is a kind someone makes with their hands, and
 * those are exactly the kinds a different batch size means something for.
 *
 * A Nernst potential is a property of a cell, not a batch of anything.
 * Offering "×2" on it would invite a record that means nothing.
 */
export function scaleKind(kind) {
  return typeof kind === 'string' && hasProcedure(kind);
}

/**
 * Re-run the calculation a record came from, on new inputs.
 *
 * ## Why a dispatcher has to exist here
 *
 * Each tab owns its own calculator and calls it directly — `WeighTab` imports
 * `stockFromSolid`, `BufferTab` imports `bufferRecipe`. Nothing generic maps a
 * record's `kind` back to the function that produced it, because until now
 * nothing needed to: replay reopens the tab and lets the tab do the work.
 *
 * Scaling cannot do that. It has to produce a finished record — inputs *and*
 * outputs — without mounting a tab, because the user is looking at the history
 * list, not at the tab the record came from. So the mapping is stated here,
 * once, for the kinds scaling supports.
 *
 * The mapping is deliberately partial: it covers exactly the kinds
 * `hasProcedure` admits, and `recompute` returns null for anything else rather
 * than guessing. A record whose kind is not here gets no scale control, so
 * this null is a guard against a future kind being added to the recipe
 * registry without a calculator behind it.
 */
const CALCULATORS = {
  massForMolarity: stockFromSolid,
  stockFromSolid,
  dilution,
  bufferRecipe,
  dilutionSeries,
};

/** The kinds scaling can re-calculate. Derived, so it cannot drift. */
export const SCALABLE_KINDS = Object.freeze(Object.keys(CALCULATORS));

/**
 * The calculator for a kind, or null when there is none.
 *
 * Returned rather than called so the caller decides what to do about a null
 * and so this stays testable without constructing a record.
 */
export function calculatorFor(kind) {
  return CALCULATORS[kind] ?? null;
}

/**
 * Re-calculate a record's inputs, or return null if the kind has no calculator.
 *
 * The result is the shape a tab would have produced, so the caller can write
 * it straight into a new record without knowing which tab it came from.
 */
export function recompute(kind, inputs) {
  const fn = calculatorFor(kind);
  if (!fn) return null;
  return fn(inputs);
}
