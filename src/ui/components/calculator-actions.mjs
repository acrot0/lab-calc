/**
 * What each keypad action does.
 *
 * ## Why this is a table of functions rather than a chain of `if`s
 *
 * The keypad declares its actions as strings (`{ action: 'memAdd' }`) so the key
 * tables stay pure data. This is where those strings become behaviour, and the
 * registry is exported so `test/keypad.test.mjs` can check that every string a
 * key names has an implementation. Without that check a typo in the key table
 * produces a key that silently does nothing — which reads as a broken
 * calculator rather than as a missing feature, and is the kind of defect that
 * survives a code review because both halves look right on their own.
 *
 * ## Why each action takes a context object
 *
 * Every action needs the same four or five things — the entry, the setters, the
 * last result, the memory — and passing them individually would make each
 * signature different and each one a thing to keep in sync. One context object
 * means the drawer builds it once and every action reads what it needs.
 *
 * The actions are pure in the sense that matters for testing: given a context
 * they produce a deterministic change and return nothing. None of them touch
 * the DOM, so they can be exercised without rendering.
 */

/**
 * A result, or a number, in the shape the expression engine accepts as a
 * variable.
 *
 * The engine propagates a dimension vector through arithmetic, so `ans * 2`
 * after a `20 g/L` answer is `40 g/L` rather than a bare `40`. A bare number
 * would lose that, which is why the memory and the last answer are both held as
 * whole results rather than as numbers.
 *
 * Returns `null` for anything that is not a usable quantity — an error state, a
 * missing value — so callers can treat "nothing to store" as a single case.
 */
export function asQuantity(result) {
  if (!result || result.error || result.value == null) return null;
  return {
    value: result.value,
    unit: result.unit ?? null,
    exponents: result.exponents ?? [0, 0, 0, 0, 0, 0],
  };
}

/**
 * Add or subtract a value against a memory.
 *
 * Shared by `M+` and `M−` because they differ only in the sign, and writing the
 * empty-memory case twice is how the two drift apart. Storing on an empty
 * memory rather than treating it as zero is deliberate: `M+` on a blank memory
 * meaning "add to nothing" would make every user's first press a no-op, and the
 * first press is the one they meant.
 *
 * A non-finite result leaves the memory alone — `Infinity` in a memory would
 * silently poison every later recall, and there is no way for the user to see
 * where it came from.
 */
export function accumulate(memory, addend, sign) {
  if (!addend) return memory;
  if (!memory) return sign > 0 ? addend : { ...addend, value: -addend.value };
  const next = memory.value + sign * addend.value;
  return Number.isFinite(next) ? { ...memory, value: next } : memory;
}

/**
 * The action registry.
 *
 * Every entry takes the context and mutates it. The names are the strings the
 * key tables use; see `calculator-keys.mjs`.
 */
export const ACTIONS = {
  /** Empty the entry. */
  clear: (c) => c.setSrc(''),

  /** Delete the last character. */
  back: (c) => c.setSrc((s) => s.slice(0, -1)),

  /**
   * Evaluate, and make the result the new `ans`.
   *
   * Recorded here rather than on every keystroke: a history of every
   * intermediate state of one expression is not a history. `=` is also what
   * moves the result into `ans`, which is what makes a chained calculation work
   * without retyping — `5 g / 250 mL`, `=`, then `ans * 2`.
   */
  equals: (c) => c.commit(),

  /**
   * Negate the whole entry.
   *
   * The whole entry rather than the last number: on a keypad where the entry is
   * one expression, "the number I am typing" and "what is in the box" are the
   * same thing to the user, and a `±` that flipped only part of a sum would be
   * a surprise.
   */
  negate: (c) => c.setSrc((s) => (s.startsWith('-') ? s.slice(1) : `-${s}`)),

  memAdd: (c) => c.setMemory((m) => accumulate(m, asQuantity(c.result) ?? asQuantity(c.last), 1)),
  memSub: (c) => c.setMemory((m) => accumulate(m, asQuantity(c.result) ?? asQuantity(c.last), -1)),

  /**
   * Insert what is in the memory, with its unit.
   *
   * The unit is carried, because a memory holding `40 g/L` that recalls as a
   * bare `40` has quietly dropped the one thing the value meant. A recalled
   * quantity is bracketed so it composes: `2 * MR` inserts `2*(40 g/L)` rather
   * than `2*40 g/L`, which would divide the 2 by the litre.
   *
   * Zero when the memory is empty, which is the one case where a recall has
   * nothing to recall: inserting nothing would look like the key was dead.
   */
  memRecall: (c) => c.setSrc((s) => {
    if (!c.memory) return s + '0';
    const n = c.formatNumber(c.memory.value);
    return c.memory.unit ? `${s}(${n} ${c.memory.unit})` : s + n;
  }),

  memClear: (c) => c.setMemory(null),
};

/** Every action name, for the test that checks the key tables against this. */
export const ACTION_NAMES = Object.keys(ACTIONS);
