/**
 * The calculator's keypad, as data.
 *
 * ## Why the keys are declared here rather than in the component
 *
 * The tables are pure data — a key is a label and what it does — so they can be
 * tested without rendering anything, which is how `test/keypad.test.mjs` checks
 * that no page can strand a user without a digit or a way to clear. Keeping them
 * in the component made it 676 lines, past the point where a reader can hold it
 * in their head.
 *
 * ## The four zones
 *
 * A phone keypad is used without looking, so the keys are grouped by what they
 * do and each zone is coloured: **digits**, **operators**, **functions**,
 * **controls**. That is the arrangement every physical scientific calculator
 * uses, and the reason is the same everywhere — a user reaching for `7` should
 * not have to find it among `sin` and `log`.
 *
 * ## Why the digits are at the bottom
 *
 * Thumb reach. The bottom third of a phone screen is where a thumb rests; the
 * top corners are the hardest to reach one-handed. The digits and `=` are the
 * keys pressed most, and they sit lowest. The scientific functions, pressed
 * occasionally and deliberately, are above them.
 *
 * ## `insert` versus `label`
 *
 * Several keys type more than they show: `x²` inserts `^2`, `√` inserts `sqrt(`,
 * `π` inserts `pi`. A keypad that inserted its own glyph would produce an
 * expression the parser cannot read.
 *
 * ## Every `insert` is checked against the parser
 *
 * A key that types something the evaluator rejects is worse than a missing key:
 * it looks like the calculator is broken rather than like a feature is absent.
 * `test/keypad.test.mjs` runs every `insert` through `isExpressionFragment`, so
 * a typo here fails the suite rather than surfacing as a dead key.
 */

/** Which zone a key belongs to. Drives the colour, and nothing else. */
export const ZONE = {
  fn: 'fn',
  digit: 'digit',
  op: 'op',
  ctrl: 'ctrl',
};

/**
 * The first function page: what a chemistry calculation reaches for.
 *
 * Four rows of five, which is what a phone keypad has room for before the
 * digits are pushed off the screen. The rest of what a general scientific
 * calculator offers lives on `FN_PAGE_2`, and the digits and operators stay
 * below both, so switching pages never takes away the ability to type a number.
 */
const FN_PAGE_1 = [
  [
    { label: 'sin', insert: 'sin(', zone: ZONE.fn, title: 'sin' },
    { label: 'cos', insert: 'cos(', zone: ZONE.fn, title: 'cos' },
    { label: 'tan', insert: 'tan(', zone: ZONE.fn, title: 'tan' },
    { label: 'π', insert: 'pi', zone: ZONE.fn, title: 'pi' },
    { label: 'e', insert: 'e', zone: ZONE.fn, title: 'e' },
  ],
  [
    { label: 'ln', insert: 'ln(', zone: ZONE.fn, title: 'ln' },
    { label: 'log', insert: 'log(', zone: ZONE.fn, title: 'log' },
    { label: 'sin⁻¹', insert: 'asin(', zone: ZONE.fn, title: 'asin' },
    { label: 'cos⁻¹', insert: 'acos(', zone: ZONE.fn, title: 'acos' },
    { label: 'tan⁻¹', insert: 'atan(', zone: ZONE.fn, title: 'atan' },
  ],
  [
    { label: 'x²', insert: '^2', zone: ZONE.fn, title: 'square' },
    { label: 'xʸ', insert: '^', zone: ZONE.fn, title: 'power' },
    { label: '√', insert: 'sqrt(', zone: ZONE.fn, title: 'sqrt' },
    { label: '∛', insert: 'cbrt(', zone: ZONE.fn, title: 'cbrt' },
    { label: '|x|', insert: 'abs(', zone: ZONE.fn, title: 'abs' },
  ],
  [
    { label: '1/x', insert: '1/', zone: ZONE.fn, title: 'reciprocal' },
    { label: 'n!', insert: '!', zone: ZONE.fn, title: 'factorial' },
    { label: '%', insert: '%', zone: ZONE.fn, title: 'percent' },
    { label: 'mod', insert: ' mod ', zone: ZONE.fn, title: 'modulo' },
    /*
     * `10ˣ` inserts the whole base rather than an operator, so it behaves like
     * `√` or `π`: press it and you have started a value. A key that leaves the
     * entry as a bare operator (`^`) is a key the next press can only follow,
     * never precede — and off the keypad alone, `10^-7` is the single most
     * common thing a chemist types here, so it has to work in that order.
     */
    { label: '10ˣ', insert: '10^', zone: ZONE.fn, title: 'pow10' },
  ],
];

/**
 * The second function page: the rest of what a general calculator has.
 *
 * These are the integer and sign functions, the hyperbolic set, the log bases
 * that make `log`'s meaning explicit rather than assumed, and the two-argument
 * functions. `π` and `e` repeat from the first page because they are reached for
 * constantly and leaving the page to get back to them is a tax on the most
 * common thing a user does here.
 */
const FN_PAGE_2 = [
  [
    { label: 'sinh', insert: 'sinh(', zone: ZONE.fn, title: 'sinh' },
    { label: 'cosh', insert: 'cosh(', zone: ZONE.fn, title: 'cosh' },
    { label: 'tanh', insert: 'tanh(', zone: ZONE.fn, title: 'tanh' },
    { label: 'eˣ', insert: 'exp(', zone: ZONE.fn, title: 'exp' },
    { label: 'π', insert: 'pi', zone: ZONE.fn, title: 'pi' },
  ],
  [
    { label: 'round', insert: 'round(', zone: ZONE.fn, title: 'round' },
    { label: 'floor', insert: 'floor(', zone: ZONE.fn, title: 'floor' },
    { label: 'ceil', insert: 'ceil(', zone: ZONE.fn, title: 'ceil' },
    { label: 'trunc', insert: 'trunc(', zone: ZONE.fn, title: 'trunc' },
    { label: 'sign', insert: 'sign(', zone: ZONE.fn, title: 'sign' },
  ],
  [
    { label: 'log₂', insert: 'log2(', zone: ZONE.fn, title: 'log2' },
    { label: 'log₁₀', insert: 'log10(', zone: ZONE.fn, title: 'log10' },
    { label: 'min', insert: 'min(', zone: ZONE.fn, title: 'min' },
    { label: 'max', insert: 'max(', zone: ZONE.fn, title: 'max' },
    { label: 'hypot', insert: 'hypot(', zone: ZONE.fn, title: 'hypot' },
  ],
  [
    { label: 'atan2', insert: 'atan2(', zone: ZONE.fn, title: 'atan2' },
    /*
     * The argument separator, beside the functions that take more than one.
     * Without it `hypot(`, `min(`, `max(` and `atan2(` open a call the on-screen
     * keypad cannot finish — on a phone, where there is no comma on the
     * keyboard, they would be dead ends.
     */
    { label: ',', insert: ',', zone: ZONE.fn, title: 'comma' },
    // The inverse hyperbolics. A general calculator has the forward ones, and
    // an inverse that is missing is a dead end for whoever reaches for it.
    { label: 'sinh⁻¹', insert: 'asinh(', zone: ZONE.fn, title: 'asinh' },
    { label: 'cosh⁻¹', insert: 'acosh(', zone: ZONE.fn, title: 'acosh' },
    { label: 'tanh⁻¹', insert: 'atanh(', zone: ZONE.fn, title: 'atanh' },
  ],
];

/**
 * The memory and recall row, above the digits and below the function pages.
 *
 * It does not swap with the function pages, because it is not a function: `M+`
 * is an entry control, and a user reaching for it should not have to know which
 * page they are on. It is a row of its own rather than a chip strip because a
 * memory key is pressed as often as an operator — accumulating a running total
 * across a dilution series is five or six presses in a row — and a 28px chip is
 * not a target for that.
 *
 * `ans` sits here rather than among the functions because it is a recall, which
 * is what the rest of this row does. Typing the previous answer back in by hand
 * is the commonest thing a calculator user does, and rounding it on the way
 * through the keypad is where a chained calculation goes wrong.
 */
export const MEMORY_KEYS = [
  [
    { label: 'ans', insert: 'ans', zone: ZONE.ctrl, title: 'ans' },
    { label: 'M+', action: 'memAdd', zone: ZONE.ctrl, title: 'memAdd' },
    { label: 'M−', action: 'memSub', zone: ZONE.ctrl, title: 'memSub' },
    { label: 'MR', action: 'memRecall', zone: ZONE.ctrl, title: 'memRecall' },
    { label: 'MC', action: 'memClear', zone: ZONE.ctrl, title: 'memClear' },
  ],
];

/**
 * The digit and operator block, at the bottom of every page.
 *
 * A conventional arrangement with the operators down the right, which is what
 * every calculator app and every physical calculator uses. A novel arrangement
 * would be a thing to learn for no gain.
 *
 * The brackets live here rather than on a function page because they are entry
 * controls: a user half-way through `(1+2)*3` must be able to close the group
 * whatever page the keypad is showing.
 */
export const DIGIT_KEYS = [
  [
    { label: '7', insert: '7', zone: ZONE.digit },
    { label: '8', insert: '8', zone: ZONE.digit },
    { label: '9', insert: '9', zone: ZONE.digit },
    { label: '÷', insert: '/', zone: ZONE.op, title: 'divide' },
    { label: '⌫', action: 'back', zone: ZONE.ctrl, title: 'back' },
  ],
  [
    { label: '4', insert: '4', zone: ZONE.digit },
    { label: '5', insert: '5', zone: ZONE.digit },
    { label: '6', insert: '6', zone: ZONE.digit },
    { label: '×', insert: '*', zone: ZONE.op, title: 'multiply' },
    { label: 'C', action: 'clear', zone: ZONE.ctrl, title: 'clear' },
  ],
  [
    { label: '1', insert: '1', zone: ZONE.digit },
    { label: '2', insert: '2', zone: ZONE.digit },
    { label: '3', insert: '3', zone: ZONE.digit },
    { label: '−', insert: '-', zone: ZONE.op, title: 'subtract' },
    { label: '±', action: 'negate', zone: ZONE.ctrl, title: 'negate' },
  ],
  [
    { label: '0', insert: '0', zone: ZONE.digit },
    { label: '.', insert: '.', zone: ZONE.digit },
    { label: '(', insert: '(', zone: ZONE.ctrl, title: 'openParen' },
    { label: ')', insert: ')', zone: ZONE.ctrl, title: 'closeParen' },
    { label: '+', insert: '+', zone: ZONE.op, title: 'add' },
  ],
  [
    /*
     * Full width, and the only key that spans.
     *
     * `=` is the key a thumb finds by position, and giving it the whole bottom
     * row makes it the largest target in the window — which is right, because
     * it is the one key every calculation ends with. The four columns it spans
     * would otherwise hold nothing, and a one-cell `=` beside four empty cells
     * reads as a layout mistake.
     */
    { label: '=', action: 'equals', zone: ZONE.op, span: 5, title: 'equals' },
  ],
];

/**
 * The units a user is most likely to type, as one-tap insertions.
 *
 * Ordered by how often a bench calculation uses them, not alphabetically: mass
 * and volume first, then amount and concentration.
 */
export const UNIT_KEYS = ['g', 'mg', 'mL', 'L', 'mol', 'M'];

/**
 * Which page of functions to show.
 *
 * Exported as a list so a test can assert both pages have the same shape — a
 * page with a different row length would make the keypad jump when switched.
 */
export const FN_PAGES = [FN_PAGE_1, FN_PAGE_2];

/**
 * Every key on the keypad, in the order they appear.
 *
 * Used by the layout tests and by the i18n check, both of which need to see the
 * whole set rather than one page.
 */
export function allKeys() {
  return [...FN_PAGE_1, ...FN_PAGE_2, ...MEMORY_KEYS, ...DIGIT_KEYS].flat();
}
