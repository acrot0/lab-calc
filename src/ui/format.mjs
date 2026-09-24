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
