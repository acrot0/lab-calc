/**
 * Coded errors for the calculation layer.
 *
 * The calc modules are pure and have no idea what language the user reads, so
 * they must not throw user-facing prose. They throw a code plus the values the
 * message needs; the UI translates. Without this split, switching to English
 * would leave Chinese error text behind, and the calc tests would have to
 * assert on prose that is really a presentation concern.
 *
 * `code` maps to a key under `errors.*` in the locale dictionaries.
 */
export class CalcError extends Error {
  constructor(code, params = {}) {
    // The English message is only a developer-facing fallback for logs and
    // stack traces; the UI never shows `message` directly.
    super(`${code} ${JSON.stringify(params)}`);
    this.name = 'CalcError';
    this.code = code;
    this.params = params;
  }
}

export const fail = (code, params) => {
  throw new CalcError(code, params);
};

/*
 * The three guards, ordered so the message names the actual problem.
 *
 * `Number.isFinite` is checked **before** the sign, and that ordering is the
 * whole point. `NaN < 0` is false and `NaN <= 0` is false too, so with the
 * sign first, NaN falls through both sign branches and is reported as a sign
 * violation — an empty number field produced 「浓度不能为负数（当前为 NaN）」,
 * a message about a number the user never typed. Not-a-number is its own
 * failure with its own wording (「必须是有效数字」), and the only way to reach
 * it is to test for it first.
 */

export function requirePositive(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('mustBeFinite', { name: field });
  }
  if (value <= 0) {
    fail('mustBePositive', { name: field, value });
  }
}

export function requireNonNegative(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('mustBeFinite', { name: field });
  }
  if (value < 0) {
    fail('mustNotBeNegative', { name: field, value });
  }
}

export function requireFinite(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('mustBeFinite', { name: field });
  }
}
