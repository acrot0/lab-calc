/**
 * A small expression evaluator that tracks units.
 *
 * What this adds over `eval` or a plain arithmetic parser is dimension: `5 g /
 * 250 mL` is 20 g/L, and the answer carries its own unit because the units were
 * divided along with the numbers. That is the whole reason it exists — a
 * calculator that returns `0.02` for that expression has thrown away the part
 * the student came for.
 *
 * Three deliberate restrictions:
 *
 *   - **No `eval`, and no `Function`.** The input is typed by a user and, in the
 *     inline-field mode, arrives inside a form submission. A parser that only
 *     knows the operators listed below cannot be talked into executing anything.
 *   - **Only addition and subtraction check dimensions.** `5 g + 2 mL` is an
 *     error; `5 g * 2 mL` is a quantity with dimension M·L3, which is a real
 *     thing even if it is rarely wanted. Multiplication and division compose
 *     dimensions rather than requiring them to match.
 *   - **Powers take dimensionless exponents.** `(2 g)^2` is fine; `2^(3 g)` is
 *     not, because a unit in an exponent has no meaning here.
 *
 * Pure, no I/O, and it does not know what language the user reads — errors are
 * codes, translated by the UI layer.
 */

import { fail } from './errors.mjs';
import {
  UNITS, TEMPERATURE_UNITS, EXPONENTS, DIMENSIONS, dimensionFromExponents,
  displayFactor, nameExponents, isDimensionless, addExponents, subtractExponents,
} from './units.mjs';

/**
 * A value with a dimension.
 *
 * `exp` is the exponent vector in base units, so two quantities are addable
 * exactly when their vectors are equal. Storing the vector rather than a
 * dimension name is what lets `g/L` and `mg/mL` be recognised as the same
 * dimension without either being named in a lookup table.
 *
 * `unit` is the unit the user wrote, kept so the answer can be reported back in
 * the units they are working in rather than in base units — a result in g/L is
 * readable, the same result in kg/m3 is not.
 */
function quantity(value, exp, unit, scale, literal = true) {
  return { value, exp, unit, scale, literal };
}

/** A dimensionless number. */
function scalar(value) {
  return quantity(value, [0, 0, 0, 0, 0, 0], null, 1);
}

/**
 * The magnitude in SI base units.
 *
 * `value` alone is not the answer: it is the number as written, expressed in
 * whatever compound unit the operations produced. `5 g / 250 mL` evaluates to
 * `0.02`, which is 0.02 grams per millilitre — correct, and not what anyone
 * wants to read. Multiplying by `scale` gives 0.02 kg/m3, which is 20 g/L.
 *
 * `scale` is the factor from the written compound unit to the SI base, so it
 * multiplies and divides along with the values.
 */
const toSi = (q) => q.value * q.scale;

/**
 * Whether a quantity is absolute temperature, which needs the affine path.
 *
 * `K` is both a temperature and, in this app, never a scale factor, so the test
 * is the unit symbol rather than the exponent vector — a vector cannot express
 * "this zero is not the additive identity".
 */
const isTemperature = (q) => q.unit !== null && q.unit in TEMPERATURE_UNITS;

/**
 * Named constants.
 *
 * A constant is not a unit and not a variable: it has a value and no dimension,
 * which is what lets `2*pi` work. The names are lower-case and deliberately
 * short because they are typed by hand — `pi` and `e` are the two a chemistry
 * student reaches for, and both are checked against `UNITS` by a test so a
 * future unit named `e` cannot silently shadow the constant.
 */
const CONSTANTS = {
  pi: Math.PI,
  e: Math.E,
};

/**
 * Functions, and the dimensional rule they all obey.
 *
 * Every one of these takes a **dimensionless** argument and returns a
 * dimensionless result. That is not a limitation to be worked around — it is
 * the whole reason this calculator can be trusted. `sin(5 g)` has no meaning:
 * the sine of a mass depends on the unit you happen to measure it in, so a
 * calculator that returns a number for it is returning a number that would
 * change if the user typed `5000 mg` instead. Refusing is the correct answer,
 * and it is what separates this from a calculator that tracks units only for
 * display.
 *
 * The one exception is `sqrt`, which is meaningful on a dimensioned quantity —
 * the square root of an area is a length — so it halves the exponent vector
 * instead of requiring it to be zero. `cbrt` does the same in thirds.
 *
 * Trigonometry is in radians. Degrees are a display preference, handled by the
 * caller converting before it gets here, because a parser that silently
 * reinterpreted its input by mode would make `sin(pi/2)` depend on a toggle.
 */
const FUNCTIONS = {
  sin: (x) => Math.sin(x),
  cos: (x) => Math.cos(x),
  tan: (x) => Math.tan(x),
  asin: (x) => Math.asin(x),
  acos: (x) => Math.acos(x),
  atan: (x) => Math.atan(x),
  sinh: (x) => Math.sinh(x),
  cosh: (x) => Math.cosh(x),
  tanh: (x) => Math.tanh(x),
  // The inverse hyperbolics: a general calculator has the forward ones, and an
  // inverse that is missing is a dead end for anyone who reaches for it.
  asinh: (x) => Math.asinh(x),
  acosh: (x) => Math.acosh(x),
  atanh: (x) => Math.atanh(x),
  /*
   * `log` is base 10 and `ln` is natural.
   *
   * That is the calculator convention, and it is worth stating because
   * libraries disagree: `expr-eval` defines `log` as natural and offers
   * `log10` separately, which makes `log(100)` return 4.605 where a person
   * expects 2. A calculator is used by people who learned the convention from
   * a keypad, so the keypad's meaning wins — and `log2` and `log10` are both
   * available for anyone who wants to be explicit.
   */
  ln: (x) => Math.log(x),
  log: (x) => Math.log10(x),
  log2: (x) => Math.log2(x),
  log10: (x) => Math.log10(x),
  exp: (x) => Math.exp(x),
  // Accurate near zero, where `exp(x) - 1` loses most of its significant
  // figures to cancellation.
  expm1: (x) => Math.expm1(x),
  log1p: (x) => Math.log1p(x),
  abs: (x) => Math.abs(x),
  round: (x) => Math.round(x),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  // Toward zero, unlike floor: trunc(-2.5) is -2, floor(-2.5) is -3.
  trunc: (x) => Math.trunc(x),
  sign: (x) => Math.sign(x),
  /*
   * The angle of the point (x, y), taking both signs into account.
   *
   * `atan(y/x)` cannot know which quadrant it is in — it gives the same answer
   * for (1, 1) and (-1, -1) — which is the entire reason `atan2` exists and
   * takes the arguments in the order it does.
   */
  atan2: (y, x) => Math.atan2(y, x),
  // √(a² + b² + …), without overflowing on large values the way a naive
  // `sqrt(sum of squares)` would.
  hypot: (...xs) => Math.hypot(...xs),
  min: (...xs) => Math.min(...xs),
  max: (...xs) => Math.max(...xs),
};

/**
 * How many arguments each function takes. Anything unlisted takes one.
 *
 * Declared rather than read from `fn.length`, which counts only the parameters
 * before the first default or rest — so `hypot(...xs)` would report 0 and
 * `min(...xs)` would be checked against a number that is not its arity.
 */
const ARITY = {
  atan2: 2,
  hypot: null,   // variadic
  min: null,
  max: null,
};

/** Functions that scale the exponent vector rather than requiring it to be zero. */
const ROOTS = {
  sqrt: 0.5,
  cbrt: 1 / 3,
};

/**
 * Every callable name, so a single lookup decides whether an identifier is a
 * function. `ROOTS` holds the two that take a dimensioned argument, so testing
 * `FUNCTIONS` alone would leave `sqrt` to be read as an unknown unit.
 */
const CALLABLE = new Set([...Object.keys(FUNCTIONS), ...Object.keys(ROOTS)]);

/**
 * Operators spelled as words.
 *
 * Same problem as `CALLABLE` above and the same fix: `postfix()` treats a bare
 * identifier as a unit — `g` means `1 g` — so `mod` was being read as an
 * unknown unit before the parser's operator loop could ever see it. Listing the
 * word operators here is what makes the parser stop and let `term()` match
 * them.
 *
 * Kept separate from `CALLABLE` because these are not called: `mod` takes no
 * parentheses and binds as an infix operator.
 */
const WORD_OPERATORS = new Set(['mod']);

/** The domains each function is defined on, so a bad input is a clear error. */
const DOMAINS = {
  ln: (x) => x > 0,
  log: (x) => x > 0,
  log2: (x) => x > 0,
  asin: (x) => x >= -1 && x <= 1,
  acos: (x) => x >= -1 && x <= 1,
};

/**
 * n!, defined only where it has a value.
 *
 * `gamma(n+1)` would extend it to non-integers and to a curve that is not what
 * anyone typing `5!` means. The domain is the non-negative integers, and the
 * cap is there because 171! overflows a double — past that the honest answer is
 * "too large", not `Infinity`.
 */
function factorial(n) {
  if (!Number.isInteger(n) || n < 0) fail('functionDomain', { fn: '!' });
  if (n > 170) fail('functionDomain', { fn: '!' });
  let out = 1;
  for (let i = 2; i <= n; i++) out *= i;
  return out;
}

/**
 * Apply a named function to an already-parsed argument.
 *
 * The dimensionless requirement is enforced here rather than in the table above,
 * so the check cannot be forgotten when a function is added: a name in
 * `FUNCTIONS` that is not in `ROOTS` gets the check by default.
 */
function applyFunction(name, args) {
  const arg = args[0];

  if (name in ROOTS) {
    if (args.length !== 1) fail('functionArity', { fn: name, got: args.length, want: 1 });
    const k = ROOTS[name];
    if (arg.value < 0) fail('functionDomain', { fn: name });
    return quantity(
      arg.value ** k,
      arg.exp.map((x) => x * k),
      arg.unit,
      arg.scale ** k,
      false,
    );
  }

  /*
   * Arity is checked here rather than left to the implementation, because
   * `Math.min()` with no arguments returns Infinity and `Math.hypot()` returns
   * 0 — both are answers, and neither is what the user meant. A function called
   * with the wrong number of arguments is an error, not a value.
   *
   * `null` means variadic: any count of one or more.
   */
  const want = name in ARITY ? ARITY[name] : 1;
  if (want === null ? args.length < 1 : args.length !== want) {
    fail('functionArity', { fn: name, got: args.length, want: want ?? '≥1' });
  }

  // Every argument must be a plain number: the sine of 5 g is not a quantity
  // this can report, and neither is the hypotenuse of a mass and a volume.
  for (const a of args) {
    if (!isDimensionless(a.exp)) {
      fail('functionNotDimensionless', { fn: name, unit: a.unit ?? nameExponents(a.exp) });
    }
  }

  const domain = DOMAINS[name];
  if (domain && !domain(arg.value)) fail('functionDomain', { fn: name });

  const out = FUNCTIONS[name](...args.map((a) => a.value));
  if (!Number.isFinite(out)) fail('functionDomain', { fn: name });
  return scalar(out);
}

/**
 * Typographic characters that stand for an operator, and the ASCII they mean.
 *
 * This exists because of where expressions come from. Nobody types `×` on a
 * keyboard — they copy it out of a Word document, a slide, an Excel cell or a
 * PDF, and those all substitute the typographic form: `×` for the asterisk,
 * `÷` for the slash, U+2212 for the hyphen. Every one of them was rejected as
 * "cannot parse", which reads to the user as the calculator refusing a paste.
 *
 * The alternative — swapping in a general maths library — does not fix this.
 * `mathjs` rejects `0.1 × 250 ÷ 58.44`, `2−3`, `1 234.5` and `１２＋３` exactly
 * as this parser did (measured), because the problem is not the grammar. It is
 * that nobody normalises the text before the grammar sees it. That is what this
 * table is for, and it is 40 lines rather than a 654 KB dependency that brings
 * its own unit system and would replace the one this app is built around.
 *
 * Nothing here is a unit symbol, which is what makes a blanket substitution
 * safe. `µ` (U+00B5) is checked in particular: it *is* a unit prefix, so it is
 * not in the left column — the Greek mu is mapped onto it rather than away from
 * it, so a `μg` copied from a paper lands on the `µg` the unit table holds.
 */
const CHAR_ALIASES = new Map(Object.entries({
  // Multiplication, in every spelling Unicode offers.
  '×': '*', '⨯': '*', '⨉': '*', '∙': '*',
  '⋅': '*', '·': '*', '∗': '*', '＊': '*',
  // Division. U+2044 is the fraction slash a PDF produces for `1⁄2`.
  '÷': '/', '∕': '/', '⁄': '/', '／': '/',
  /*
   * Subtraction. The dash family is the reason this table has to be explicit:
   * en dash, em dash, horizontal bar and figure dash are four different
   * characters that a word processor picks between by context, and all four
   * mean "minus" when they appear between two numbers.
   */
  '−': '-', '–': '-', '—': '-', '―': '-',
  '‒': '-', '﹣': '-', '－': '-',
  '＋': '+',
  '，': ',', '％': '%',
  '（': '(', '）': ')', '．': '.',
  // Spaces that are not U+0020: a pasted table cell is full of these, and one
  // of them is enough to make a number unreadable to the tokenizer.
  ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ',
  ' ': ' ', ' ': ' ', '　': ' ',
  /*
   * Canonical-equivalence characters. These are the ones where Unicode says two
   * codepoints are *the same character*, and a paper will use whichever its
   * typesetting system picked: the ohm sign rather than Greek omega, the
   * angstrom sign rather than A-with-ring. Mapped onto the form the unit table
   * stores, so `1 kΩ` and `5 Å` survive a paste.
   */
  'μ': 'µ', 'Ω': 'Ω', 'Å': 'Å',
}));

/**
 * Superscript digits, as an exponent.
 *
 * `cm²` and `10⁻³` are how a unit and a power are written in every textbook,
 * and neither is typeable on the keypad. They are rewritten to `cm^2` and
 * `10^-3` rather than dropped, because dropping the exponent changes the value:
 * `2²` would become `22`.
 *
 * This is why the normalisation is a table and not `String.normalize('NFKC')`,
 * which looks like the obvious answer and is wrong here. NFKC maps `²` to a
 * plain `2`, so `2²` silently becomes twenty-two; it maps `½` to the three
 * characters `1⁄2`; and it maps `µ` onto Greek mu, breaking every microgram in
 * the unit table. A normaliser for arithmetic has to know what the characters
 * *mean*, which is a judgement NFKC does not make.
 */
const SUPERSCRIPTS = new Map(Object.entries({
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-',
}));

/**
 * Rewrite pasted typography into the characters the tokenizer reads.
 *
 * Applied inside `evaluate`, so every entry point gets it — the calculator
 * window, the inline expression fields and the tests all go through the same
 * door, and there is no path that parses unnormalised text.
 *
 * The original text is not kept for the error message. If a character was
 * normalised it is because it is understood, so an error that quotes the
 * normalised form is quoting something the user can act on; quoting `×` back at
 * someone who just pasted `×` would tell them nothing.
 */
export function normalizeExpression(source) {
  const text = String(source ?? '');
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    // A run of superscripts is one exponent, so `^` is emitted once for the run
    // rather than once per digit: `10⁻³` is `10^-3`, not `10^-^3`.
    const sup = SUPERSCRIPTS.get(c);
    if (sup !== undefined) {
      let digits = sup;
      while (i + 1 < text.length && SUPERSCRIPTS.has(text[i + 1])) {
        i += 1;
        digits += SUPERSCRIPTS.get(text[i]);
      }
      out += `^${digits}`;
      continue;
    }

    // Fullwidth forms, which a Chinese IME produces by default and which are
    // invisible in the input box: `１２＋３` looks like arithmetic and is not.
    const code = c.charCodeAt(0);
    if (code >= 0xff10 && code <= 0xff19) { out += String.fromCharCode(code - 0xff10 + 0x30); continue; }
    if (code >= 0xff21 && code <= 0xff3a) { out += String.fromCharCode(code - 0xff21 + 0x41); continue; }
    if (code >= 0xff41 && code <= 0xff5a) { out += String.fromCharCode(code - 0xff41 + 0x61); continue; }

    out += CHAR_ALIASES.get(c) ?? c;
  }

  /*
   * A space between digit groups is a thousands separator.
   *
   * The strict three-digit grouping is required, exactly as the comma rule in
   * the tokenizer requires it: `1 234 567` collapses, while `2 3` does not and
   * stays the syntax error it should be. Guessing more loosely would turn two
   * numbers someone meant to keep apart into one they did not.
   */
  return out.replace(/(\d)[ \t](?=\d{3}(?!\d))/g, '$1');
}

/**
 * What an identifier may be made of.
 *
 * ASCII letters and digits are the ordinary case. The five non-ASCII
 * characters are here because they are the *keys* of real units — `µg`, `µm`,
 * `Å`, `Ω`, `kΩ`, `°C`, `‰` — and the tokenizer's ASCII-only rule could not
 * read any of them. A unit the converter offers but the calculator cannot spell
 * is a unit that works in one half of the app and is "cannot parse" in the
 * other, which is how `1 kΩ` and `5 µg` were failing.
 *
 * Widening the class is safe because these characters are not operators and not
 * digits: none of them can change how a number or an expression tokenizes. The
 * lookup that follows is still against the unit table, so an unreadable string
 * of them is reported as an unknown unit rather than accepted.
 */
const IDENT_START = /[A-Za-z_µÅΩ°‰]/;
const IDENT_CONT = /[A-Za-z0-9_µÅΩ°‰]/;

/**
 * Split input into tokens.
 *
 * Numbers may carry an exponent (`1.5e-3`) and units may carry a digit
 * (`cm3`), so the identifier rule includes digits after the first character.
 * The `%` sign is not a token: it is part of the unit `%w/v`, and a lone `%`
 * would be ambiguous between percent and modulo.
 */
function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }

    if (/[0-9.]/.test(c)) {
      /*
       * Thousands separators are accepted and ignored.
       *
       * `1,000` is how a number is written on every bench sheet, in every paper
       * and on every label, and a calculator that answers "cannot parse" is one
       * that has to be worked around. The separators are stripped, never
       * interpreted: `1,000` is one thousand, not two arguments.
       *
       * Only the strict grouping form is accepted — a comma must be followed by
       * exactly three digits and then a non-digit. So `1,000` and `1,234,567`
       * work, while `1,00` and `1,0000` remain syntax errors rather than being
       * silently read as something the user did not write. The European form
       * (`1.000,5`) is deliberately not guessed at: it is ambiguous against the
       * decimal point, and guessing wrong is worse than refusing.
       */
      const plain = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(src.slice(i));
      const grouped = /^[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(src.slice(i));
      const m = grouped && (!plain || grouped[0].length > plain[0].length) ? grouped : plain;
      if (!m) fail('expressionSyntax', { at: src.slice(i, i + 12) });
      tokens.push({ type: 'number', value: Number.parseFloat(m[0].replace(/,/g, '')) });
      i += m[0].length;
      continue;
    }

    // `%w/v` is a single unit symbol and the only one containing punctuation,
    // so it is matched before the operator rules rather than after.
    if (src.startsWith('%w/v', i)) {
      tokens.push({ type: 'ident', value: '%w/v' });
      i += 4;
      continue;
    }

    if (IDENT_START.test(c)) {
      const m = new RegExp(`^${IDENT_START.source}${IDENT_CONT.source}*`).exec(src.slice(i));
      tokens.push({ type: 'ident', value: m[0] });
      i += m[0].length;
      continue;
    }

    // A lone `%` is percent, and it is reached only after `%w/v` has been
    // ruled out above — so the two never compete for the same input.
    if (c === '%') {
      tokens.push({ type: '%' });
      i++;
      continue;
    }

    /*
     * `**` is accepted as a synonym for `^`.
     *
     * Both are in wide use — `^` from calculator keypads, `**` from every
     * programming language and spreadsheet formula — and a user who types the
     * one this does not know gets a syntax error for arithmetic that is
     * unambiguous. It is tokenised as a single `^` rather than added as a
     * second operator, so the parser and its precedence have one power
     * operator to reason about and the two spellings cannot drift apart.
     */
    if (c === '*' && src[i + 1] === '*') {
      tokens.push({ type: '^' });
      i += 2;
      continue;
    }

    // The argument separator. It reaches the tokenizer only outside a number:
    // `1,000` is matched by the number rule above and never gets here, so the
    // two meanings of a comma cannot be confused for one another.
    if (c === ',') {
      tokens.push({ type: ',' });
      i++;
      continue;
    }

    if ('+-*/^()!'.includes(c)) {
      tokens.push({ type: c });
      i++;
      continue;
    }

    fail('expressionSyntax', { at: c });
  }
  return tokens;
}

/**
 * Recursive-descent parser, evaluating as it goes.
 *
 * Precedence, loosest first: `+ -`, then `* /`, then `^` (right-associative),
 * then unary minus, then atoms. There is no separate AST because nothing needs
 * one — the only consumer wants a value, and building a tree to walk it once
 * would be a layer with no user.
 */
function parse(tokens, t, vars) {
  let pos = 0;

  /*
   * Whether a number may absorb a following unit name as part of itself.
   *
   * True everywhere except inside an exponent. `250 mL` is one quantity, but in
   * `10^-3 M` the `M` belongs to the whole power rather than to the `3` — and
   * the exponent is parsed by the same `atom` that implements the
   * number-then-unit rule, so without this flag the `M` was swallowed into the
   * exponent and the expression was rejected as "an exponent must be a plain
   * number".
   *
   * A flag rather than a parameter because the alternative is threading it
   * through `atom` → `postfix` → `power` → `unary` and back, four signatures
   * changed to carry one bit that only one call site ever sets. It is set and
   * restored around a single parse call, so it cannot leak.
   */
  let unitSuffix = true;

  const peek = () => tokens[pos];
  const eat = (type) => (peek()?.type === type ? tokens[pos++] : null);

  /**
   * Consume an identifier token equal to `word`, or nothing.
   *
   * Used for operators spelled as words — `mod` — which arrive from the
   * tokenizer as identifiers and would otherwise be read as a unit or an
   * unknown function name. Returning null rather than throwing is what lets
   * `term` fall through to its `else break`, so an ordinary identifier after a
   * term is still an error rather than being swallowed here.
   */
  const eatWord = (word) => (
    peek()?.type === 'ident' && peek().value === word ? tokens[pos++] : null
  );

  /**
   * The exponent vector of a unit symbol, rejecting anything that is not one.
   *
   * Checked against the tables rather than assumed, so a typo is reported as an
   * unknown unit instead of silently becoming a variable named `grm`.
   *
   * Temperature is refused here on purpose: `5 K` in an arithmetic expression
   * would need to know whether the zero point is in play, and every expression
   * that mixes it with a scale factor is meaningless. Temperature is reachable
   * only through `convert`.
   */
  function factorOfUnit(name) {
    if (!(name in UNITS)) fail('unknownUnit', { unit: name });
    return UNITS[name].factor;
  }

  /**
   * The exponent vector of a unit symbol, rejecting anything that is not one.
   *
   * Three refusals, in order of specificity:
   *
   * 1. **An affine unit.** Temperature does not scale from its base by
   *    multiplication — 0 °C is 273.15 K — so a quantity carrying it has no
   *    factor, and every expression that mixes it with one is meaningless.
   *    Checked by *dimension*, not by symbol: `TEMPERATURE_UNITS` is keyed by
   *    the ASCII symbols (`K`, `C`, `F`, `R`) while `UNITS` also holds the
   *    typographic `°C` and `°F`, so a symbol test let `1 °C` through and
   *    treated it as a factor-1 unit. That is a silent wrong answer, which is
   *    worse than the parse error it replaced.
   * 2. **An unknown unit.** A typo should say so rather than become a variable.
   * 3. **A dimension with no exponent vector.** `ratio` and `angle` have none —
   *    deliberately, because an all-zeroes one would make every plain number
   *    look like an angle (see the note on `EXPONENTS`). Reading
   *    `EXPONENTS[dim]` without this check produced `undefined`, and the first
   *    arithmetic on it threw a raw `TypeError` whose English message —
   *    "Cannot read properties of undefined" — was shown to the user.
   *    `1 deg`, `1 turn` and `1 ‰` all did this.
   */
  function exponentsOfUnit(name) {
    if (name in UNITS && DIMENSIONS[UNITS[name].dim]?.affine) {
      fail('temperatureInExpression', { unit: name });
    }
    if (name in TEMPERATURE_UNITS) fail('temperatureInExpression', { unit: name });
    if (!(name in UNITS)) fail('unknownUnit', { unit: name });
    const exp = EXPONENTS[UNITS[name].dim];
    if (!exp) fail('unitNotInExpressions', { unit: name });
    return exp;
  }

  function atom() {
    const tk = peek();

    if (tk?.type === 'number') {
      pos++;
      // A number followed by a unit is one quantity: `250 mL`. A number on its
      // own is dimensionless, which is what makes `2 * 3 g` work.
      const next = unitSuffix ? peek() : null;
      if (next?.type === 'ident') {
        /*
         * A callable name is only a function when a `(` follows it.
         *
         * The bare check on the name was wrong, and `min` is what exposed it:
         * it is both the minimum function and the minute. `1 min` was rejected
         * as `1` followed by a function name, which broke every expression
         * containing a minute — a unit this app uses in its own kinetics and
         * centrifugation tabs.
         *
         * Requiring the parenthesis resolves it without ambiguity, because
         * `min(3,1,2)` and `1 min` differ in exactly that character. The same
         * rule keeps `2sin(3)` an error rather than reading `sin` as an unknown
         * unit — `sin` is not a unit, so it still fails, with a better message.
         */
        const followedByParen = tokens[pos + 1]?.type === '(';
        if (CALLABLE.has(next.value) && followedByParen) {
          fail('expressionSyntax', { at: `${tk.value}${next.value}` });
        }
        // A word operator after a number is an operator, not a unit: `10 mod 3`
        // must leave `mod` for `term()` to match. Without this the parser reads
        // "mod" as an unknown unit and reports the wrong problem entirely.
        if (WORD_OPERATORS.has(next.value)) return scalar(tk.value);
        // Any identifier here is meant as a unit — `2 + 3` has an operator
        // next, not an identifier — so an unrecognised one is reported as an
        // unknown unit rather than left for the caller to choke on as trailing
        // input. `5 furlong` should say "unknown unit", not "syntax error".
        pos++;
        // Kept in the unit the user wrote. `scale` records the factor to the
        // SI base, so a lone `250 mL` can be echoed back as 250 mL while a
        // computed result is normalised — see `evaluate`.
        return quantity(tk.value, exponentsOfUnit(next.value), next.value, factorOfUnit(next.value));
      }
      return scalar(tk.value);
    }

    if (tk?.type === 'ident') {
      pos++;
      // A name may be a constant, a function, or a unit, and the order matters:
      // `e` is a constant before it could be an unknown unit, and `sin` needs
      // its argument parsed before anything is computed.
      /*
       * A caller-supplied variable, before the constants and before units.
       *
       * `ans` is the case this exists for: the calculator's "last result". It
       * cannot be a constant, because its value changes per evaluation, and it
       * must be resolvable by name, because that is what a user types. Checked
       * before `CONSTANTS` so a variable could in principle shadow one, but the
       * names in use (`ans`) do not collide with any.
       *
       * A variable carries a **unit** as well as a value: `ans` after `5 g / 250 mL`
       * is 20 g/L, and a bare number would silently drop the dimension and make
       * `ans * 2` a dimensionless 40.
       */
      if (vars && Object.prototype.hasOwnProperty.call(vars, tk.value)) {
        const v = vars[tk.value];
        return quantity(v.value, v.exponents ?? [0, 0, 0, 0, 0, 0], v.unit ?? null, 1);
      }
      if (tk.value in CONSTANTS) return scalar(CONSTANTS[tk.value]);
      /*
       * A callable name is a function only when a `(` follows it — see the note
       * in the number rule above. Without the same check here, a bare `min`
       * would demand a parenthesis instead of being read as the minute, so
       * `5 min` would fail while `1 min` worked.
       */
      /*
       * A callable name with no `(` is only acceptable if it is also a unit.
       *
       * `min` is both — the minimum and the minute — and the parenthesis is
       * what tells them apart. `sin` is only a function, so a bare one is an
       * error, and saying "unknown unit sin" would be a worse message than
       * saying it needs its parentheses.
       */
      if (CALLABLE.has(tk.value) && !(tk.value in UNITS) && peek()?.type !== '(') {
        fail('expressionSyntax', { at: `${tk.value} needs (` });
      }

      if (CALLABLE.has(tk.value) && peek()?.type === '(') {
        const name = tk.value;
        eat('(');
        /*
         * A comma-separated argument list.
         *
         * Every function took exactly one argument until `atan2` and `hypot`
         * arrived, and a general calculator needs both. Parsing the list here
         * rather than special-casing the two-argument names keeps the arity
         * check in one place — `applyFunction` decides how many it wants and
         * says so when it gets a different number.
         */
        const args = [expression()];
        while (eat(',')) args.push(expression());
        if (!eat(')')) fail('expressionSyntax', { at: 'missing )' });
        return applyFunction(name, args);
      }
      /*
       * A word operator is not a value: leave it for `term()` to match.
       *
       * Reached when `mod` appears where an operand was expected, which is
       * `10 mod 3` — the token after `10` is the operator, and `percent()`
       * would otherwise try to read it as a unit named "mod".
       */
      if (WORD_OPERATORS.has(tk.value)) {
        fail('expressionSyntax', { at: `${tk.value} needs a value before it` });
      }
      // A bare unit is one of it: `g` means `1 g`, so `5 / mL` works.
      return quantity(1, exponentsOfUnit(tk.value), tk.value, factorOfUnit(tk.value));
    }

    if (eat('(')) {
      /*
       * Inside brackets, a number may take a unit again.
       *
       * The `unitSuffix` suspension exists for one shape — `10^-3 M`, where the
       * unit belongs to the power rather than to the exponent. It must not
       * follow the parse into a bracketed group, or `2^(3 g)` would stop being
       * "an exponent must be a plain number" and become a bare syntax error
       * pointing at the `g`, which describes the input worse.
       */
      const outer = unitSuffix;
      unitSuffix = true;
      let inner;
      try {
        inner = expression();
      } finally {
        unitSuffix = outer;
      }
      if (!eat(')')) fail('expressionSyntax', { at: 'missing )' });
      return inner;
    }

    if (tk?.type === '-') { pos++; const v = unary(); return negate(v); }
    if (tk?.type === '+') { pos++; return unary(); }

    fail('expressionSyntax', { at: tk ? String(tk.value ?? tk.type) : 'end of input' });
    return null;
  }

  const negate = (q) => quantity(-q.value, q.exp, q.unit, q.scale, false);

  /**
   * Postfix operators, which bind tighter than anything binary.
   *
   * Factorial is the tightest binding in the grammar, which is the convention
   * every calculator uses: `2*3!` is 12, `3!^2` is 36, and `2^3!` is 64. It
   * sits inside `power` rather than after it — applying it to the result of
   * the exponentiation would make `3!^2` parse as `(3!)^2` by accident and
   * `2^3!` as `(2^3)!` = 40320, which is not what anyone means.
   */
  function postfix() {
    let base = atom();
    while (eat('!')) {
      if (!isDimensionless(base.exp)) {
        fail('functionNotDimensionless', { fn: '!', unit: base.unit ?? nameExponents(base.exp) });
      }
      base = scalar(factorial(base.value));
    }
    return base;
  }

  function power() {
    let base = postfix();
    while (eat('^')) {
      // The exponent may not absorb a unit name — see `unitSuffix`.
      unitSuffix = false;
      let exp;
      try {
        exp = unary();
      } finally {
        unitSuffix = true;
      }
      if (!isDimensionless(exp.exp)) fail('exponentNotDimensionless', { unit: exp.unit ?? '' });
      const n = exp.value;
      if (!Number.isFinite(n)) fail('expressionSyntax', { at: 'exponent' });
      // A fractional power of a dimensioned quantity is legal arithmetic — the
      // square root of an area is a length — so the exponents are scaled rather
      // than the base being required to be dimensionless.
      base = quantity(base.value ** n, base.exp.map((x) => x * n), base.unit, base.scale ** n, false);

      /*
       * A unit written after a power belongs to the whole power.
       *
       * `10^-3 M` is (10⁻³) × M: the exponent is `-3`, not `-3 M`. The unit
       * name is taken here rather than by `atom` because `atom` is where the
       * number-then-unit rule lives, and by the time the exponent has been
       * parsed the number it would have applied to is gone.
       *
       * This is not implicit multiplication arriving by the back door. It is
       * the same rule `250 mL` uses — a number followed by a unit is one
       * quantity — applied to a number that happens to have an exponent. Only a
       * bare unit name is taken, so `2^3 pi` is still a trailing-token error.
       *
       * The `10ˣ` keypad key inserts exactly `10^` and the unit chips insert a
       * bare `M`, so this is the sequence that key was added for: `10ˣ`, `3`,
       * `−`, `M`. It was the one path that did not work.
       */
      const after = unitSuffix ? peek() : null;
      if (after?.type === 'ident' && !WORD_OPERATORS.has(after.value) && after.value in UNITS) {
        pos++;
        base = quantity(base.value, exponentsOfUnit(after.value), after.value, factorOfUnit(after.value), false);
      }
    }
    return base;
  }

  function unary() {
    if (eat('-')) return negate(unary());
    if (eat('+')) return unary();
    return power();
  }

  /**
   * Percent, as a postfix operator on a bare number.
   *
   * `50%` is `0.5`, and it binds tighter than `*` so `200*5%` is 10 — the way
   * every calculator and spreadsheet reads it. Written as its own level rather
   * than folded into `unary` because it is postfix: the thing it applies to has
   * to be parsed before it can be divided.
   *
   * It is not a unit. `%w/v` is, and is tokenised separately above; a bare `%`
   * after a dimensioned quantity (`5 g%`) is refused, because "percent of a
   * gram" is not a quantity this can report.
   */
  function percent() {
    let v = power();
    while (eat('%')) {
      if (!isDimensionless(v.exp)) {
        fail('functionNotDimensionless', { fn: '%', unit: v.unit ?? nameExponents(v.exp) });
      }
      v = scalar(v.value / 100);
    }
    return v;
  }

  function term() {
    let left = percent();
    for (;;) {
      if (eat('*')) {
        const right = percent();
        left = quantity(
          left.value * right.value,
          addExponents(left.exp, right.exp),
          left.unit ?? right.unit,
          left.scale * right.scale,
          false,
        );
      } else if (eat('/')) {
        const right = percent();
        if (right.value === 0) fail('divideByZero', {});
        left = quantity(
          left.value / right.value,
          subtractExponents(left.exp, right.exp),
          left.unit ?? right.unit,
          left.scale / right.scale,
          false,
        );
      } else if (eatWord('mod')) {
        /*
         * Modulo, spelled as a word.
         *
         * `%` cannot be it: in a lab calculator a trailing percent means "per
         * hundred" — `0.9%` is a concentration of 0.009 — and that reading is
         * the one this app exists to serve. Making `%` mean modulo would break
         * every percent entry to gain a remainder operation that is used far
         * less. `mod` is unambiguous in both directions and is what several
         * calculators and every spreadsheet function use.
         *
         * Both operands must be plain numbers: the remainder of 5 g divided by
         * 3 mL is not a quantity this can report.
         */
        const right = percent();
        if (!isDimensionless(left.exp) || !isDimensionless(right.exp)) {
          fail('functionNotDimensionless', { fn: 'mod', unit: left.unit ?? right.unit ?? '' });
        }
        if (right.value === 0) fail('divideByZero', {});
        // The sign follows the dividend, which is the convention in JS, C, Java
        // and Python's math.fmod — so `-7 mod 3` is -1, not 2.
        left = scalar(left.value % right.value);
      } else break;
    }
    return left;
  }

  function expression() {
    let left = term();
    for (;;) {
      const op = eat('+') ?? eat('-');
      if (!op) break;
      const right = term();
      if (isTemperature(left) || isTemperature(right)) fail('temperatureInExpression', { unit: left.unit ?? right.unit });
      // The check that makes this a dimensional calculator: two quantities add
      // only if their vectors match. `5 g + 2 mL` fails here rather than
      // producing 7 of something.
      if (!sameExponents(left.exp, right.exp)) {
        fail('incompatibleUnits', {
          from: left.unit ?? nameExponents(left.exp),
          to: right.unit ?? nameExponents(right.exp),
          fromDim: nameExponents(left.exp),
          toDim: nameExponents(right.exp),
        });
      }
      // The two sides can be written in different units of the same dimension
      // — `5 g + 2 mg` — so the right side is rescaled to the left's before the
      // sum. Adding the raw numbers would give 7 g, which is wrong by a factor
      // of a thousand and looks entirely reasonable.
      const a = toSi(left);
      const b = toSi(right);
      const sum = op.type === '+' ? a + b : a - b;
      left = quantity(sum, left.exp, left.unit ?? right.unit, 1, false);
    }
    return left;
  }

  const out = expression();
  if (pos < tokens.length) fail('expressionSyntax', { at: String(peek().value ?? peek().type) });
  return out;
}

function sameExponents(a, b) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Evaluate an expression, returning the value and what it is.
 *
 * The returned `dimension` is a name where the table has one and a composed
 * label where it does not, so a correct intermediate result is never reported
 * as an error just because it has no familiar name.
 */
export function evaluate(source, vars) {
  const text = normalizeExpression(source).trim();
  if (text === '') fail('expressionEmpty', {});
  const q = parse(tokenize(text), text, vars);
  const si = toSi(q);
  if (!Number.isFinite(si)) fail('expressionNotFinite', {});

  /*
   * A single literal is echoed in the unit it was written in — `250 mL` is
   * 250 mL, not 0.25 L. Anything computed is normalised to its dimension's base
   * unit, because the written compound unit is an artefact of how the
   * operations happened to associate: `5 g / 250 mL` carries "g" and means
   * g/mL, which would be reported as 0.02 g — a right number wearing the wrong
   * unit, which is worse than a wrong one.
   */
  if (q.literal && q.unit !== null) {
    return {
      value: q.value,
      unit: q.unit,
      dimension: nameExponents(q.exp),
      dimensionless: isDimensionless(q.exp),
      exponents: q.exp,
    };
  }

  const dim = dimensionFromExponents(q.exp);
  if (dim !== null) {
    // Back out of SI into the unit a chemist reads. The composition happened in
    // kg, m and s; the answer is wanted in g, L and mol.
    return {
      value: si / displayFactor(dim),
      unit: DIMENSIONS[dim].base,
      dimension: dim,
      dimensionless: false,
      exponents: q.exp,
    };
  }

  /*
   * A dimension the table does not name — g squared, or a reciprocal volume.
   * There is no base unit to convert back to, so the value is reported in SI
   * and labelled with its composed exponents: `5 / mL` is 5e6 L-3, which is
   * 5000 per litre and 5 per millilitre. That reads oddly and is correct; the
   * alternative is inventing a display unit for a combination nobody converts,
   * and the cases that matter — every concentration, energy and pressure a
   * bench uses — are named dimensions and take the readable path above.
   */
  return {
    value: si,
    unit: isDimensionless(q.exp) ? null : nameExponents(q.exp),
    dimension: isDimensionless(q.exp) ? null : nameExponents(q.exp),
    dimensionless: isDimensionless(q.exp),
    exponents: q.exp,
  };
}

/**
 * Evaluate, or return null if the input is not an expression at all.
 *
 * For the number fields: a user typing `0.1` must not be told it is a bad
 * expression, and a user typing `0.1*250/58.44` must get 0.4278 rather than a
 * parse error. Returning null rather than throwing is what lets the field fall
 * back to plain number parsing.
 */
export function tryEvaluate(source) {
  try {
    return evaluate(source);
  } catch {
    return null;
  }
}

/**
 * Whether a fragment is a prefix of something the parser could accept.
 *
 * The calculator keypad types a character at a time, so almost every
 * intermediate state is an incomplete expression — `sqrt(`, `2^`, `hypot(3,`.
 * None of those evaluate, and asking whether they do would only ever answer no.
 *
 * What is worth knowing is whether the fragment is on a path to a valid
 * expression, which is what this answers: it evaluates a few completions of the
 * fragment and reports whether any succeeds. A key whose insertion is accepted
 * by no completion is a key that types a character the tokenizer cannot read.
 */
export function isExpressionFragment(fragment) {
  const raw = String(fragment ?? '');
  /*
   * Both the raw fragment and its trimmed form are probed, because the two
   * carry different meaning. A word operator needs the spaces around it
   * (`1 mod 1` parses, `1mod1` does not), while a symbol does not and a leading
   * space would only make the probe ambiguous. Trimming one and not the other
   * would let one class of key through and fail the other.
   */
  const forms = raw.trim() === raw ? [raw] : [raw, raw.trim()];
  /*
   * The completions cover both shapes a fragment can be: something that ends
   * mid-token (`sqrt(`) and something that is a whole token needing an operand
   * on each side (`^`, `mod`). Hence the bare form, the form with a literal
   * before and after, and the forms wrapped in a call — `)` and `,` are legal
   * only inside one, and a two-argument function needs both.
   */
  const probes = [
    (t) => t,
    (t) => `${t}1)`,
    (t) => `1${t}`,
    (t) => `1${t}1`,
    (t) => `2${t}3`,
    (t) => `(1${t}`,
    (t) => `min(1${t}2)`,
    (t) => `${t}1,2)`,
  ];
  return forms.some((f) => probes.some((probe) => tryEvaluate(probe(f)) !== null));
}

/**
 * Whether a string contains an operator, and so is worth evaluating.
 *
 * A bare number is not an expression: evaluating it would be a slower way to
 * get the same number, and it would make `1e-3` depend on the parser accepting
 * exponent notation. The field only calls the evaluator when this is true.
 *
 * A function name alone counts. `sqrt(2)` has parentheses and would match
 * anyway, but `2!` and `50%` do not, and both are things a user types into a
 * field expecting them to be computed rather than rejected as not-a-number.
 */
export function looksLikeExpression(source) {
  return /[+\-*/^()!%]/.test(String(source ?? ''));
}

/** Re-exported so a caller can name a dimension without importing units.mjs. */
export { dimensionFromExponents };
