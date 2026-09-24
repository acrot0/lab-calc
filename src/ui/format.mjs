/**
 * Shared display helpers for the UI layer.
 *
 * `n` turns a form string into a number, treating blank as NaN rather than 0 —
 * a blank field is "not filled in", and silently reading it as zero would let
 * a user calculate with a value they never entered.
 */

export const n = (s) => (String(s).trim() === '' ? NaN : Number(s));

/** Trim trailing zeros so 14.610 reads as 14.61, but never below 0 decimals. */
export const fmt = (v, d = 3) => (Number.isFinite(v) ? Number(v.toFixed(d)).toString() : '—');

/**
 * Format a number that may span many orders of magnitude.
 *
 * `fmt` renders 6.02214076e22 as the literal string "6.02214076e+22", which is
 * what a raw Number#toString gives — readable to a programmer, not to someone
 * checking a bench sheet. Copy numbers and particle counts routinely run from
 * 1e4 to 1e14, so they get a ×10ⁿ form instead. Anything within ordinary range
 * is left to `fmt`, which trims zeros far better than a fixed exponent would.
 *
 * The bounds are inclusive: 100000 and 0.001 stay plain, since both still read
 * as a quantity rather than a magnitude.
 */
export const fmtSci = (v, d = 3) => {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs !== 0 && (abs < 1e-3 || abs > 1e5)) {
    const [mantissa, exponent] = v.toExponential(d).split('e');
    const trimmed = Number(mantissa).toString();
    return `${trimmed}×10${superDigits(exponent)}`;
  }
  return fmt(v, d);
};

/** Superscript digits for an exponent, sign included: "+22" → "²²". */
const SUPERSCRIPT = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const superDigits = (exponent) => String(Number(exponent))
  .split('')
  .map((ch) => SUPERSCRIPT[ch] ?? ch)
  .join('');

/**
 * Pick the result that belongs to the direction currently selected.
 *
 * Tabs that compute several directions tag each result with the direction that
 * produced it (`setOut({ mode, ...r })`) and gate the render on this. The reset
 * effect runs *after* render, so on the render where the direction changes the
 * previous result is still in state — rendering it paints the old direction's
 * numbers under the new direction's labels for one frame. Worse, when the two
 * directions have different output shapes (absorbance vs. a standard-curve fit)
 * it is a crash, not a stale number.
 *
 * `key` differs by tab because the dimension being switched is not always
 * called a mode — the pH tab switches between an acid and a base.
 *
 * An undefined `value` never matches, even against a result that also lacks
 * the key: "no direction selected" must hide every result, not reveal all of
 * them because two undefineds compared equal.
 */
export const shownFor = (out, key, value) => (
  out && value != null && out[key] === value ? out : null
);
