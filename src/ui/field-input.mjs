/**
 * What a number field holds, from what the user typed or pasted.
 *
 * This lives outside the component because it is the one piece of the form
 * layer with a decision in it, and a decision buried in JSX is a decision that
 * only a browser can test. It is pure — text in, number or null out — so it is
 * tested directly, and `Fields.jsx` is left with rendering.
 *
 * ## Why the order of the two attempts is the whole point
 *
 * The field used to ask `looksLikeExpression` first and fall back to
 * `Number.parseFloat`. That predicate only looks for an operator character, so
 * `1,234.5` and `1 234.5` failed it and went to `parseFloat`, which stops at
 * the first non-digit and returns **1**. A thousand-grouped number pasted out
 * of a spreadsheet became a wrong number with no error shown — the field looked
 * filled in. That is the worst failure this app can have, and it was reachable
 * by copy-paste, which is how numbers actually arrive.
 *
 * So the evaluator gets the first say. It is the stricter of the two: it
 * accepts a plain number, a grouped number, a fullwidth number, a number with a
 * unit, and an expression, and returns null for anything else. It is also where
 * the paste normalisation lives (see `normalizeExpression`), so a value copied
 * out of Word or a PDF arrives here already readable.
 *
 * The fallback is a strict numeric-literal test rather than `parseFloat`, and
 * that is deliberate: `parseFloat('1,00')` is 1 and `parseFloat('0x10')` is 0,
 * so a partial parse of something the evaluator *rejected* is exactly the
 * silent-wrong-answer path this function exists to close. The one form the
 * fallback genuinely adds is a trailing dot — `5.` while the user is still on
 * their way to `5.5`, which the parser's number rule does not take.
 */

import { evaluate } from '../calc/expression.mjs';

/** A number written out, optionally with an exponent. `5.` is included. */
const NUMERIC_LITERAL = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * The value of an expression, or null if it does not evaluate.
 *
 * A dimensioned result has no place in a scalar field: `5 g / 2 mL` is a
 * concentration, and putting 2500 into a "volume in mL" box would be putting a
 * number where a different kind of quantity belongs. So a quantity with a
 * dimension is refused here even though it evaluated fine.
 */
export function safeEvaluate(src) {
  try {
    const r = evaluate(src);
    return r.dimensionless ? r.value : null;
  } catch {
    return null;
  }
}

/**
 * Read a number field.
 *
 * @returns {number|null} the value, or null if the text is not a number
 */
export function readNumberField(text) {
  const s = String(text ?? '');
  const evaluated = safeEvaluate(s);
  if (evaluated !== null) return evaluated;
  const trimmed = s.trim();
  return NUMERIC_LITERAL.test(trimmed) ? Number(trimmed) : null;
}
