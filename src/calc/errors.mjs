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

/** Names passed as `{ name: '浓度' }` used to be prose. They are keys now. */
export const FIELD = {
  molarity: 'molarity',
  volume: 'volume',
  concentration: 'concentration',
  stockConc: 'stockConc',
  targetConc: 'targetConc',
  titrantConc: 'titrantConc',
  percent: 'percent',
  pka: 'pka',
  pkb: 'pkb',
  factor: 'factor',
  steps: 'steps',
  points: 'points',
  overshoot: 'overshoot',
  stepVolume: 'stepVolume',
};

export function requirePositive(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    fail('mustBePositive', { name: field, value });
  }
}

export function requireNonNegative(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail('mustNotBeNegative', { name: field, value });
  }
}

export function requireFinite(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail('mustBeFinite', { name: field });
  }
}
