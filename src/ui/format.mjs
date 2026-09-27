import { roundPair } from '../calc/uncertainty.mjs';

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

/**
 * Render a value and its uncertainty at the precision the uncertainty allows.
 *
 * The whole point of carrying an uncertainty is that it decides how many digits
 * of the value mean anything. Quoting 0.10237 ± 0.04 is not more informative
 * than 0.10 ± 0.04 — it is a claim that the last three digits were measured,
 * and they were not.
 *
 * `roundPair` decides the decimal place once, from the uncertainty, and applies
 * it to both. Doing it separately is where a hand calculation leaves the two
 * inconsistent by a digit.
 *
 * The digits come from `roundPair`, so the text and the arithmetic cannot
 * disagree; `fmt` is then given the decimal count implied by the rounded pair
 * rather than a fixed one. `fmt` trims trailing zeros, which is right — 0.10
 * and 0.1 are the same measurement and the shorter one reads better.
 *
 * An exact value (`unc === 0`) has no limit from this path, so the caller's
 * `digits` is used unchanged. That is a count, a definition, or a molar mass
 * built only from monoisotopic elements.
 */
export function fmtMeasured(value, unc, { digits = 4, unit = '' } = {}) {
  if (!Number.isFinite(value)) return { text: '—', uncText: '' };
  if (!Number.isFinite(unc) || unc === 0) {
    return { text: `${fmtSci(value, digits)}${unit}`, uncText: '' };
  }
  const pair = roundPair({ value, unc });
  // The decimal count of the rounded uncertainty, which is also the value's.
  const places = decimalsOf(pair.unc);
  return {
    text: `${fmt(pair.value, places)}${unit}`,
    uncText: `± ${fmt(pair.unc, places)}${unit}`,
  };
}

/**
 * Decimal places a rounded number actually occupies.
 *
 * `toFixed` cannot be used directly: 0.1 stored as a float is 0.10000000000000
 * 000555, so a naive count reports 17 places. Going through the shortest
 * round-trip representation (`toString`) gives the places a reader would count.
 */
function decimalsOf(v) {
  const s = Math.abs(v).toString();
  if (s.includes('e')) {
    // Exponential form: the exponent is negative for anything under 1, and the
    // places are that exponent plus whatever decimals the mantissa carries.
    const [mantissa, exp] = s.split('e');
    const frac = mantissa.split('.')[1]?.length ?? 0;
    return Math.max(0, frac - Number(exp));
  }
  return s.split('.')[1]?.length ?? 0;
}
