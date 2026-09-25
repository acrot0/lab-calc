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
  ln: (x) => Math.log(x),
  log: (x) => Math.log10(x),
  log2: (x) => Math.log2(x),
  exp: (x) => Math.exp(x),
  abs: (x) => Math.abs(x),
  round: (x) => Math.round(x),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
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
function applyFunction(name, arg) {
  if (name in ROOTS) {
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

  if (!isDimensionless(arg.exp)) {
    fail('functionNotDimensionless', { fn: name, unit: arg.unit ?? nameExponents(arg.exp) });
  }
  const domain = DOMAINS[name];
  if (domain && !domain(arg.value)) fail('functionDomain', { fn: name });
  const out = FUNCTIONS[name](arg.value);
  if (!Number.isFinite(out)) fail('functionDomain', { fn: name });
  return scalar(out);
}

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
      const m = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(src.slice(i));
      if (!m) fail('expressionSyntax', { at: src.slice(i, i + 12) });
      tokens.push({ type: 'number', value: Number.parseFloat(m[0]) });
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

    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
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
function parse(tokens, t) {
  let pos = 0;

  const peek = () => tokens[pos];
  const eat = (type) => (peek()?.type === type ? tokens[pos++] : null);

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

  function exponentsOfUnit(name) {
    if (name in TEMPERATURE_UNITS) fail('temperatureInExpression', { unit: name });
    if (!(name in UNITS)) fail('unknownUnit', { unit: name });
    return EXPONENTS[UNITS[name].dim];
  }

  function atom() {
    const tk = peek();

    if (tk?.type === 'number') {
      pos++;
      // A number followed by a unit is one quantity: `250 mL`. A number on its
      // own is dimensionless, which is what makes `2 * 3 g` work.
      const next = peek();
      if (next?.type === 'ident') {
        // A number followed by a *function* name is a syntax error rather than
        // a unit: `2sin(3)` has no meaning, and silently reading `sin` as an
        // unknown unit would report the wrong problem.
        if (CALLABLE.has(next.value)) fail('expressionSyntax', { at: `${tk.value}${next.value}` });
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
      if (tk.value in CONSTANTS) return scalar(CONSTANTS[tk.value]);
      if (CALLABLE.has(tk.value)) {
        const name = tk.value;
        if (!eat('(')) fail('expressionSyntax', { at: `${name} needs (` });
        const arg = expression();
        if (!eat(')')) fail('expressionSyntax', { at: 'missing )' });
        return applyFunction(name, arg);
      }
      // A bare unit is one of it: `g` means `1 g`, so `5 / mL` works.
      return quantity(1, exponentsOfUnit(tk.value), tk.value, factorOfUnit(tk.value));
    }

    if (eat('(')) {
      const inner = expression();
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
      const exp = unary();
      if (!isDimensionless(exp.exp)) fail('exponentNotDimensionless', { unit: exp.unit ?? '' });
      const n = exp.value;
      if (!Number.isFinite(n)) fail('expressionSyntax', { at: 'exponent' });
      // A fractional power of a dimensioned quantity is legal arithmetic — the
      // square root of an area is a length — so the exponents are scaled rather
      // than the base being required to be dimensionless.
      base = quantity(base.value ** n, base.exp.map((x) => x * n), base.unit, base.scale ** n, false);
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
export function evaluate(source) {
  const text = String(source ?? '').trim();
  if (text === '') fail('expressionEmpty', {});
  const q = parse(tokenize(text), text);
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
