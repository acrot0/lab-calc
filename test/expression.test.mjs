import { describe, expect, it } from 'vitest';
import {
  evaluate, looksLikeExpression, tryEvaluate,
} from '../src/calc/expression.mjs';
import { UNITS } from '../src/calc/units.mjs';

/** Evaluate and describe the result, or name the error code. */
function ev(src) {
  const r = evaluate(src);
  return `${r.value} ${r.unit ?? ''} [${r.dimension ?? 'dimensionless'}]`.trim();
}

const code = (src) => {
  try { evaluate(src); return null; } catch (e) { return e.code; }
};

describe('evaluate — arithmetic', () => {
  it('should do plain arithmetic', () => {
    expect(evaluate('2+3').value).toBe(5);
    expect(evaluate('10 - 4').value).toBe(6);
    expect(evaluate('6*7').value).toBe(42);
    expect(evaluate('9/2').value).toBe(4.5);
    expect(evaluate('2^10').value).toBe(1024);
  });

  it('should respect precedence', () => {
    expect(evaluate('2 + 3 * 4').value).toBe(14);
    expect(evaluate('(2 + 3) * 4').value).toBe(20);
    expect(evaluate('2 * 3 ^ 2').value).toBe(18);
  });

  it('should treat power as right-associative', () => {
    // 2^(3^2) is 512; (2^3)^2 is 64. Getting this backwards is silent.
    expect(evaluate('2^3^2').value).toBe(512);
  });

  it('should handle unary minus', () => {
    expect(evaluate('-5 + 10').value).toBe(5);
    expect(evaluate('3 * -2').value).toBe(-6);
    expect(evaluate('--5').value).toBe(5);
  });

  it('should accept scientific notation', () => {
    expect(evaluate('1.5e-3').value).toBeCloseTo(0.0015, 12);
    expect(evaluate('2e3 + 1').value).toBe(2001);
  });

  it('should ignore whitespace', () => {
    expect(evaluate('  1  +  2  ').value).toBe(3);
  });
});

describe('evaluate — units', () => {
  it('should compute the case the calculator exists for', () => {
    // The headline: a mass divided by a volume is a concentration, and the
    // answer carries the unit because the units were divided too.
    const r = evaluate('5 g / 250 mL');
    expect(r.value).toBeCloseTo(20, 9);
    expect(r.unit).toBe('g/L');
    expect(r.dimension).toBe('massConcentration');
  });

  it('should give a result its dimension base unit, not the written one', () => {
    // `5 g / 250 mL` is 0.02 in the written compound unit g/mL. Reporting that
    // number with the unit "g" would be a right number wearing a wrong unit.
    const r = evaluate('5 g / 250 mL');
    expect(r.value).not.toBeCloseTo(0.02, 9);
    expect(r.unit).not.toBe('g');
  });

  it('should echo a lone literal in the unit it was written in', () => {
    // Nothing was computed, so there is nothing to normalise: 250 mL is 250 mL.
    expect(ev('250 mL')).toBe('250 mL [volume]');
    expect(evaluate('250 mL').value).toBe(250);
    expect(evaluate('250 mL').unit).toBe('mL');
  });

  it('should multiply quantities into a compound dimension', () => {
    const r = evaluate('1 M * 1 L');
    expect(r.value).toBeCloseTo(1, 9);
    expect(r.unit).toBe('mol');
  });

  it('should divide a voltage by a current into a resistance', () => {
    const r = evaluate('1 mV / 1 mA');
    expect(r.value).toBeCloseTo(1, 9);
    expect(r.unit).toBe('ohm');
  });

  it('should multiply a pressure by a volume into an energy', () => {
    const r = evaluate('1 atm * 1 L');
    expect(r.value).toBeCloseTo(101.325, 6);
    expect(r.unit).toBe('J');
  });

  it('should rescale the right operand before adding', () => {
    // `5 g + 2 mg` is 5.002 g. Adding the raw numbers gives 7, which is wrong
    // by a factor of a thousand and looks entirely reasonable.
    const r = evaluate('5 g + 2 mg');
    expect(r.value).toBeCloseTo(5.002, 9);
    expect(r.unit).toBe('g');
  });

  it('should treat a bare unit as one of it', () => {
    // `mL` alone is 1 mL, so `5 * mL` is 5 mL — reported normalised as 0.005 L
    // because a product is a computation, not a literal.
    const r = evaluate('5 * mL');
    expect(r.value).toBeCloseTo(0.005, 12);
    expect(r.unit).toBe('L');
    // Dividing by a bare unit gives a reciprocal: 5 per mL is 5000 per litre.
    expect(evaluate('5 g / mL').value).toBeCloseTo(5000, 6);
    expect(evaluate('5 g / mL').unit).toBe('g/L');
  });

  it('should convert within a dimension when the units differ', () => {
    const r = evaluate('1 kg / 1 m3');
    expect(r.value).toBeCloseTo(1, 9);
    expect(r.unit).toBe('g/L');
  });

  it('should scale a unit raised to a power', () => {
    // g^2 has no named dimension, so it is reported in SI — 2 g squared is
    // 4e-6 kg squared — and labelled with its composed exponents rather than
    // refused. The alternative is inventing a display unit for a combination
    // nobody converts.
    const r = evaluate('(2 g)^2');
    expect(r.value).toBeCloseTo(4e-6, 12);
    expect(r.dimension).toBe('M2');
    expect(r.unit).toBe('M2');
  });

  it('should take a root of a dimensioned quantity', () => {
    // The square root of an area is a length, which is ordinary arithmetic and
    // must not be blocked by requiring a dimensionless base.
    const r = evaluate('4 m2 ^ 0.5');
    expect(r.value).toBeCloseTo(2, 9);
    expect(r.unit).toBe('m');
    expect(r.exponents).toEqual([0, 1, 0, 0, 0, 0]);
  });

  it('should report an unnamed dimension in SI with composed exponents', () => {
    // 5 per millilitre is 5000 per litre, which is 5e6 per cubic metre. SI is
    // the only base available when the dimension has no name.
    const r = evaluate('5 / mL');
    expect(r.value).toBeCloseTo(5e6, 3);
    expect(r.dimension).toBe('L-3');
  });
});

describe('evaluate — refusals', () => {
  it('should refuse to add two different dimensions', () => {
    expect(code('5 g + 2 mL')).toBe('incompatibleUnits');
    expect(code('1 min + 1 m')).toBe('incompatibleUnits');
  });

  it('should refuse molarity plus mass concentration', () => {
    // Both read as "concentration" to a user; they are different dimensions.
    expect(code('1 M + 1 g/L')).toBe('incompatibleUnits');
  });

  it('should refuse an unknown unit', () => {
    expect(code('5 furlong')).toBe('unknownUnit');
    expect(code('5 g / 2 blobs')).toBe('unknownUnit');
  });

  it('should refuse a division by zero', () => {
    expect(code('5 g / 0')).toBe('divideByZero');
    expect(code('1 / (2 - 2)')).toBe('divideByZero');
  });

  it('should refuse a dimensioned exponent', () => {
    // A unit in an exponent has no meaning here.
    expect(code('2^(3 g)')).toBe('exponentNotDimensionless');
  });

  it('should refuse malformed input', () => {
    for (const bad of ['2 +', '* 3', '(2 + 3', '2 3', ')', '2 + + +']) {
      expect(code(bad), bad).toBe('expressionSyntax');
    }
  });

  it('should refuse empty input', () => {
    expect(code('')).toBe('expressionEmpty');
    expect(code('   ')).toBe('expressionEmpty');
  });

  it('should refuse absolute temperature in arithmetic', () => {
    // Whether the zero point is in play cannot be answered inside an
    // expression, so temperature is reachable only through convert().
    expect(code('5 K')).toBe('temperatureInExpression');
    expect(code('20 C + 5')).toBe('temperatureInExpression');
  });

  it('should refuse a non-finite result', () => {
    // 1e308 squared overflows to Infinity; reporting it as an answer would be
    // reporting a number that is not one.
    expect(code('1e308 * 1e308')).toBe('expressionNotFinite');
  });
});

describe('evaluate — safety', () => {
  it('should not evaluate anything that is not arithmetic', () => {
    // The input is typed by a user. A parser that only knows the operators
    // listed above cannot be talked into executing anything, which is why
    // there is no eval and no Function here.
    for (const bad of [
      'process.exit(1)', 'globalThis', 'require("fs")',
      'alert(1)', 'constructor', '__proto__',
    ]) {
      expect(code(bad), bad).not.toBeNull();
    }
  });

  it('should reject a bare identifier that is not a unit', () => {
    expect(code('process')).toBe('unknownUnit');
    expect(code('x')).toBe('unknownUnit');
  });
});

describe('looksLikeExpression', () => {
  it('should be true only when an operator is present', () => {
    // A bare number is not an expression: evaluating it is a slower way to get
    // the same number, and it would make `1e-3` depend on the parser.
    expect(looksLikeExpression('0.1*250/58.44')).toBe(true);
    expect(looksLikeExpression('2+2')).toBe(true);
    expect(looksLikeExpression('5 g / 2 mL')).toBe(true);
    expect(looksLikeExpression('0.1')).toBe(false);
    expect(looksLikeExpression('1e-3')).toBe(true);
    expect(looksLikeExpression('')).toBe(false);
    expect(looksLikeExpression(null)).toBe(false);
  });
});

describe('tryEvaluate', () => {
  it('should return the result for a valid expression', () => {
    expect(tryEvaluate('0.1*250/58.44').value).toBeCloseTo(0.4278, 3);
  });

  it('should return null rather than throwing on anything else', () => {
    // This is what lets a number field fall back to plain parsing instead of
    // showing a parse error for a half-typed value.
    for (const bad of ['', '2 +', 'abc', '5 g + 2 mL', null, undefined, '(((']) {
      expect(tryEvaluate(bad), String(bad)).toBeNull();
    }
  });
});

describe('evaluate — functions', () => {
  it('should evaluate the trigonometric functions in radians', () => {
    // Radians, always: a parser whose meaning depended on a degree/radian
    // toggle would make `sin(pi/2)` mean two different things at two call
    // sites. The UI converts before it gets here.
    expect(evaluate('sin(0)').value).toBe(0);
    expect(evaluate('sin(pi/2)').value).toBeCloseTo(1, 12);
    expect(evaluate('cos(0)').value).toBe(1);
    expect(evaluate('atan(1)*4').value).toBeCloseTo(Math.PI, 12);
  });

  it('should evaluate the logarithm and exponential functions', () => {
    expect(evaluate('ln(e)').value).toBeCloseTo(1, 12);
    expect(evaluate('log(1000)').value).toBe(3);
    expect(evaluate('log2(8)').value).toBe(3);
    expect(evaluate('exp(0)').value).toBe(1);
  });

  it('should evaluate the rounding functions', () => {
    expect(evaluate('abs(-5)').value).toBe(5);
    expect(evaluate('round(2.6)').value).toBe(3);
    expect(evaluate('round(-2.6)').value).toBe(-3);
    expect(evaluate('floor(2.9)').value).toBe(2);
    expect(evaluate('ceil(2.1)').value).toBe(3);
  });

  it('should take the root of a dimensioned quantity, scaling its exponents', () => {
    // The one place a function may take a dimension, because the answer is a
    // real quantity: the square root of an area is a length.
    expect(ev('sqrt(4 m2)')).toBe('2 m [length]');
    expect(ev('cbrt(8 m3)')).toBe('2 m [length]');
    expect(evaluate('sqrt(16)').value).toBe(4);
    expect(evaluate('cbrt(27)').value).toBe(3);
  });

  it('should refuse a function applied to a dimensioned quantity', () => {
    // The core guarantee. `sin(5 g)` has no value — the sine of a mass would
    // change with the unit it was measured in, so returning a number would be
    // returning a number that is wrong in a way the user cannot see.
    expect(code('sin(5 g)')).toBe('functionNotDimensionless');
    expect(code('ln(2 mL)')).toBe('functionNotDimensionless');
    expect(code('sqrt(2 g) + 1 g')).not.toBe('functionNotDimensionless');
  });

  it('should refuse a function outside its domain', () => {
    expect(code('asin(2)')).toBe('functionDomain');
    expect(code('acos(-2)')).toBe('functionDomain');
    expect(code('ln(0)')).toBe('functionDomain');
    expect(code('ln(-1)')).toBe('functionDomain');
    expect(code('log(0)')).toBe('functionDomain');
    expect(code('sqrt(-4)')).toBe('functionDomain');
  });

  it('should require parentheses after a function name', () => {
    expect(code('sin 5')).toBe('expressionSyntax');
    expect(code('sin')).toBe('expressionSyntax');
  });

  it('should reject a number written directly against a function name', () => {
    // `2sin(3)` is a typo, not a multiplication. Reading `sin` as an unknown
    // unit here would report the wrong problem.
    expect(code('2sin(3)')).toBe('expressionSyntax');
  });
});

describe('evaluate — constants, factorial and percent', () => {
  it('should resolve pi and e', () => {
    expect(evaluate('pi').value).toBeCloseTo(Math.PI, 12);
    expect(evaluate('e').value).toBeCloseTo(Math.E, 12);
    expect(evaluate('2*pi').value).toBeCloseTo(2 * Math.PI, 12);
  });

  it('should not let a constant shadow a unit of the same name', () => {
    // A future unit named `e` or `pi` would silently change what those
    // expressions mean. This fails the moment one is added, rather than
    // producing a wrong number for everyone typing `e`.
    for (const name of ['pi', 'e']) {
      expect(name in UNITS, name).toBe(false);
    }
  });

  it('should compute factorials', () => {
    expect(evaluate('5!').value).toBe(120);
    expect(evaluate('0!').value).toBe(1);
    expect(evaluate('1!').value).toBe(1);
  });

  it('should bind factorial tighter than multiplication', () => {
    // The convention every calculator uses: `2*3!` is 12, not 720.
    expect(evaluate('2*3!').value).toBe(12);
    expect(evaluate('3!^2').value).toBe(36);
  });

  it('should refuse a factorial outside the non-negative integers', () => {
    expect(code('2.5!')).toBe('functionDomain');
    expect(code('(-1)!')).toBe('functionDomain');
    // 171! overflows a double; the honest answer is "undefined", not Infinity.
    expect(code('171!')).toBe('functionDomain');
    expect(Number.isFinite(evaluate('170!').value)).toBe(true);
  });

  it('should refuse a factorial of a dimensioned quantity', () => {
    expect(code('5 g!')).toBe('functionNotDimensionless');
  });

  it('should read a trailing percent as a division by a hundred', () => {
    expect(evaluate('50%').value).toBe(0.5);
    expect(evaluate('100%').value).toBe(1);
    expect(evaluate('200*5%').value).toBe(10);
  });

  it('should not confuse a bare percent with the %w/v unit', () => {
    // `%w/v` is a concentration unit and `%` is an operator. They are matched
    // in that order, so neither can swallow the other's input.
    expect(ev('5 %w/v')).toBe('5 %w/v [massConcentration]');
    expect(evaluate('5%').value).toBe(0.05);
    expect(code('5 g%')).toBe('functionNotDimensionless');
  });

  it('should count the new syntax as an expression worth evaluating', () => {
    expect(looksLikeExpression('2!')).toBe(true);
    expect(looksLikeExpression('50%')).toBe(true);
    expect(looksLikeExpression('sin(1)')).toBe(true);
  });
});

describe('calculator conventions', () => {
  /*
   * Syntax a general-purpose calculator is expected to accept, added after a
   * user reported that ordinary arithmetic "could not be worked out". Each of
   * these is unambiguous arithmetic that a person types without thinking about
   * which calculator they are in front of.
   */

  it('should accept ** as a synonym for ^', () => {
    // `**` is the power operator in every programming language and spreadsheet
    // formula; `^` is the one on a keypad. Both are unambiguous.
    expect(evaluate('2**10').value).toBe(1024);
    expect(evaluate('2**10').value).toBe(evaluate('2^10').value);
    expect(evaluate('2**3**2').value).toBe(evaluate('2^3^2').value);
  });

  it('should keep ** right-associative, like ^', () => {
    // 2^(3^2) = 512, not (2^3)^2 = 64. The two spellings must not disagree.
    expect(evaluate('2**3**2').value).toBe(512);
  });

  it('should allow a unary minus on a ** exponent', () => {
    expect(evaluate('2**-2').value).toBe(0.25);
  });

  it('should accept thousands separators', () => {
    expect(evaluate('1,000').value).toBe(1000);
    expect(evaluate('1,234,567').value).toBe(1234567);
    expect(evaluate('1,000.5').value).toBe(1000.5);
  });

  it('should read a separator inside arithmetic as one number', () => {
    // The separator must never be read as an argument list or a second operand.
    expect(evaluate('1,000/2').value).toBe(500);
    expect(evaluate('2*1,000').value).toBe(2000);
  });

  it('should reject a malformed grouping rather than guessing', () => {
    /*
     * `1,00` and `1,0000` are not how any number is written. Reading them as
     * 100 and 10000 would be inventing an interpretation the user did not
     * write, and the mistake would be silent.
     */
    expect(code('1,00')).toBe('expressionSyntax');
    expect(code('1,0000')).toBe('expressionSyntax');
  });

  it('should not guess at the European decimal comma', () => {
    // `1.000,5` is ambiguous against the decimal point. Refusing is better
    // than picking one reading and being wrong half the time.
    expect(code('1.000,5')).toBe('expressionSyntax');
  });

  it('should still read a bare percent as percent, not modulo', () => {
    /*
     * The convention this app keeps, and the one a lab needs: `0.9%` is a
     * concentration of 0.009, not the remainder of dividing 0.9 by anything.
     * Modulo is available as the `mod` word for the cases that want it.
     */
    expect(evaluate('0.9%').value).toBeCloseTo(0.009, 12);
    expect(evaluate('100*0.9%').value).toBeCloseTo(0.9, 12);
  });

  it('should provide modulo under a name that cannot be confused', () => {
    expect(evaluate('10 mod 3').value).toBe(1);
    expect(evaluate('7 mod 2').value).toBe(1);
    expect(evaluate('10 mod 5').value).toBe(0);
  });

  it('should refuse a modulo by zero rather than returning NaN', () => {
    expect(code('5 mod 0')).toBe('divideByZero');
  });
});

describe('function coverage', () => {
  /*
   * The functions a general calculator is expected to have. The inverse
   * hyperbolics, the precision-preserving log/exp pair and the multi-argument
   * forms were all missing, which made the calculator a dead end for anyone who
   * reached for them.
   */

  it('should provide the inverse hyperbolic functions', () => {
    expect(evaluate('asinh(1)').value).toBeCloseTo(Math.asinh(1), 12);
    expect(evaluate('acosh(2)').value).toBeCloseTo(Math.acosh(2), 12);
    expect(evaluate('atanh(0.5)').value).toBeCloseTo(Math.atanh(0.5), 12);
  });

  it('should provide log10 under its own name as well as log', () => {
    // `log` is base 10 by calculator convention; `log10` is the explicit form
    // for anyone who does not want to rely on that.
    expect(evaluate('log(100)').value).toBe(2);
    expect(evaluate('log10(100)').value).toBe(2);
    expect(evaluate('ln(e)').value).toBeCloseTo(1, 12);
  });

  it('should keep log as base 10 rather than natural', () => {
    // expr-eval defines `log` as natural, which makes log(100) return 4.605
    // where a person expects 2. A calculator follows the keypad.
    expect(evaluate('log(100)').value).not.toBeCloseTo(Math.log(100), 6);
  });

  it('should provide the precision-preserving exp and log forms', () => {
    // expm1 keeps significant figures near zero where exp(x) - 1 cancels.
    expect(evaluate('expm1(0)').value).toBe(0);
    expect(evaluate('log1p(0)').value).toBe(0);
    expect(evaluate('expm1(1e-10)').value).toBeCloseTo(1e-10, 20);
  });

  it('should distinguish trunc from floor on negatives', () => {
    expect(evaluate('trunc(-2.5)').value).toBe(-2);
    expect(evaluate('floor(-2.5)').value).toBe(-3);
  });

  it('should provide sign', () => {
    expect(evaluate('sign(-3)').value).toBe(-1);
    expect(evaluate('sign(0)').value).toBe(0);
    expect(evaluate('sign(3)').value).toBe(1);
  });

  it('should take two arguments for atan2, and get the quadrant right', () => {
    // The reason atan2 exists: atan(y/x) cannot tell (1,1) from (-1,-1).
    expect(evaluate('atan2(1,1)').value).toBeCloseTo(Math.PI / 4, 12);
    expect(evaluate('atan2(-1,-1)').value).toBeCloseTo(-3 * Math.PI / 4, 12);
    expect(evaluate('atan2(1,1)').value).not.toBe(evaluate('atan2(-1,-1)').value);
  });

  it('should take any number of arguments for hypot, min and max', () => {
    expect(evaluate('hypot(3,4)').value).toBe(5);
    expect(evaluate('hypot(3,4,12)').value).toBe(13);
    expect(evaluate('min(3,1,2)').value).toBe(1);
    expect(evaluate('max(3,1,2)').value).toBe(3);
    expect(evaluate('min(5)').value).toBe(5);
  });

  it('should reject the wrong number of arguments rather than returning a value', () => {
    /*
     * `Math.min()` with no arguments is Infinity and `Math.hypot()` is 0 —
     * both are answers, and neither is what the user meant.
     */
    expect(code('atan2(1)')).toBe('functionArity');
    expect(code('atan2(1,2,3)')).toBe('functionArity');
    expect(code('sin(1,2)')).toBe('functionArity');
    expect(code('hypot()')).toBe('expressionSyntax');
  });

  it('should refuse a dimensioned argument to a plain function', () => {
    // The hypotenuse of a mass and a volume is not a quantity.
    expect(code('hypot(3 g, 4 mL)')).toBe('functionNotDimensionless');
    expect(code('min(3 g, 2 mL)')).toBe('functionNotDimensionless');
  });
});

describe('min, which is both a function and a unit', () => {
  /*
   * `min` is the minimum function and the minute. Getting this wrong broke
   * every expression containing a minute — including the app's own kinetics
   * and centrifugation tabs, which use the unit.
   *
   * The parenthesis is the whole disambiguator: `min(3,1,2)` calls the
   * function, `1 min` is a duration.
   */
  it('should read a bare min as the minute', () => {
    expect(evaluate('1 min').value).toBe(1);
    expect(evaluate('5 min').value).toBe(5);
  });

  it('should read min followed by a parenthesis as the function', () => {
    expect(evaluate('min(3,1,2)').value).toBe(1);
  });

  it('should still convert between minute and second', () => {
    // The regression was total: this is ordinary unit arithmetic that the app
    // uses, and it stopped parsing.
    expect(evaluate('2 min + 30 s').value).toBe(150);
    expect(evaluate('1 min').unit).toBe('min');
  });

  it('should keep refusing to add a minute to a metre', () => {
    expect(code('1 min + 1 m')).toBe('incompatibleUnits');
  });

  it('should still require parentheses for a name that is only a function', () => {
    // `sin` is not a unit, so a bare one is an error — and saying "unknown unit
    // sin" would be a worse message than saying it needs its parentheses.
    expect(code('sin')).toBe('expressionSyntax');
    expect(code('cos')).toBe('expressionSyntax');
    expect(code('sin 5')).toBe('expressionSyntax');
  });
});

describe('pasted typography', () => {
  /*
   * Nobody types `×` on a keyboard. They copy it out of Word, a slide, an Excel
   * cell or a PDF, and all of those substitute the typographic character. Each
   * one used to be reported as "cannot parse", which reads to the user as the
   * calculator refusing a paste — and a paste is how a number actually gets
   * into this app.
   *
   * Measured against mathjs before writing this: it rejects every one of these
   * too, because the problem is not the grammar. Nothing normalises the text
   * before the grammar sees it, which is what these tests cover.
   */

  it('should read typographic multiplication and division', () => {
    expect(evaluate('0.1 × 250 ÷ 58.44').value).toBeCloseTo(0.4277891855, 9);
    expect(evaluate('2 ⨯ 3').value).toBe(6);
    expect(evaluate('2 ⋅ 3').value).toBe(6);
    expect(evaluate('2 · 3').value).toBe(6);
  });

  it('should read the Unicode minus and the whole dash family as subtraction', () => {
    expect(evaluate('2−3').value).toBe(-1);
    expect(evaluate('5 – 3').value).toBe(2);
    expect(evaluate('5 — 3').value).toBe(2);
    expect(evaluate('5 ― 3').value).toBe(2);
    expect(evaluate('5 ‒ 3').value).toBe(2);
  });

  it('should read fullwidth digits, letters and operators', () => {
    // A Chinese IME produces these by default, and they are indistinguishable
    // from ASCII in the input box: `１２＋３` looks like arithmetic and is not.
    expect(evaluate('１２＋３').value).toBe(15);
    expect(evaluate('（2+3）').value).toBe(5);
    expect(evaluate('２．５').value).toBe(2.5);
    expect(evaluate('５×２').value).toBe(10);
  });

  it('should read a superscript exponent rather than dropping it', () => {
    // The reason the normalisation is a table and not `String.normalize`:
    // NFKC maps `²` to a plain `2`, so `2²` would silently become twenty-two.
    expect(evaluate('10⁻³').value).toBe(0.001);
    expect(evaluate('2²').value).toBe(4);
    expect(evaluate('10⁻³ M').value).toBe(0.001);
  });

  it('should read a superscript unit exponent', () => {
    expect(evaluate('5 cm²').value).toBeCloseTo(0.0025, 12);
  });

  it('should read a space-grouped number', () => {
    expect(evaluate('1 234').value).toBe(1234);
    expect(evaluate('1 234 567').value).toBe(1234567);
  });

  it('should read a non-breaking space as a grouping separator', () => {
    expect(evaluate('1\u00a0234.5').value).toBe(1234.5);
    expect(evaluate('1\u2009234.5').value).toBe(1234.5);
  });

  it('should read the fraction slash a PDF produces', () => {
    expect(evaluate('1⁄2').value).toBe(0.5);
  });

  it('should read the Greek mu as the micro sign the unit table holds', () => {
    // `μg` copied out of a paper is U+03BC; the unit table's key is U+00B5.
    // These are different characters that render identically.
    expect(evaluate('5 μg').value).toBe(5);
    expect(evaluate('5 µg').value).toBe(5);
  });

  it('should read the canonical-equivalence symbols for ohm and angstrom', () => {
    // Unicode says the ohm sign and Greek omega are the same character, and a
    // typesetting system will use whichever it prefers.
    expect(evaluate('1 kΩ').unit).toBe('kΩ');
    expect(evaluate('1 kΩ').value).toBe(1);
    expect(evaluate('5 Å').value).toBe(5);
  });

  it('should keep refusing two numbers separated by a space', () => {
    // The grouping rule requires exactly three digits, as the comma rule does.
    // Guessing more loosely would join two numbers the user kept apart.
    expect(code('2 3')).toBe('expressionSyntax');
  });

  it('should keep refusing to add a mass to a volume', () => {
    expect(code('5 g + 2 mL')).toBe('incompatibleUnits');
  });
});

describe('units the converter offers and the calculator can spell', () => {
  /*
   * The tokenizer's identifier rule was ASCII-only, so every unit whose symbol
   * contains a non-ASCII character — `µg`, `µm`, `Å`, `Ω`, `°C`, `‰` — was
   * unreadable in an expression while working perfectly in the converter. A
   * unit that works in one half of the app and is "cannot parse" in the other
   * is worse than one that is missing, because the failure looks like a typo.
   */
  it('should read the micro-prefixed units', () => {
    expect(evaluate('1 µg').unit).toBe('µg');
    expect(evaluate('1 µm').unit).toBe('µm');
    expect(evaluate('1 µs').unit).toBe('µs');
    expect(evaluate('1 µmol/L').value).toBeCloseTo(1e-6, 12);
  });

  it('should read the ohm family', () => {
    expect(evaluate('1 Ω').unit).toBe('Ω');
    expect(evaluate('1 kΩ').value).toBe(1);
    expect(evaluate('1 MΩ').value).toBe(1);
  });

  it('should read the angstrom', () => {
    expect(evaluate('5 Å').unit).toBe('Å');
    expect(evaluate('1 Å').value).toBe(1);
  });
});

describe('units with no exponent vector', () => {
  /*
   * `ratio` and `angle` deliberately have no exponent vector, because an
   * all-zeroes one would make every plain number look like an angle. Reading
   * `EXPONENTS[dim]` without checking therefore produced `undefined`, and the
   * first arithmetic on it threw a raw `TypeError` — whose English message,
   * "Cannot read properties of undefined", was shown to the user. `1 deg`,
   * `1 turn` and `1 ‰` all did this.
   */
  it('should refuse a unit of a dimension that has no exponent vector, by code', () => {
    expect(code('1 deg')).toBe('unitNotInExpressions');
    expect(code('1 turn')).toBe('unitNotInExpressions');
    expect(code('1 ‰')).toBe('unitNotInExpressions');
    expect(code('1 permille')).toBe('unitNotInExpressions');
  });

  it('should never throw a raw TypeError, which has no code and cannot be translated', () => {
    for (const src of ['1 deg', '1 °', '1 turn', '1 ‰', '1 grad', '1 arcmin']) {
      let e = null;
      try { evaluate(src); } catch (err) { e = err; }
      expect(e, `${src} should throw`).not.toBeNull();
      expect(e.code, `${src} threw ${e.name}: ${e.message}`).toBe('unitNotInExpressions');
    }
  });

  it('should still refuse a temperature in an expression, with its own code', () => {
    // The more specific message wins: a temperature is a unit this app *does*
    // use, and "convert it separately" is the useful thing to say.
    expect(code('1 K')).toBe('temperatureInExpression');
    expect(code('1 °C')).toBe('temperatureInExpression');
  });
});

describe('caller-supplied variables', () => {
  /*
   * `ans` is the reason this exists: the calculator's "last result". It cannot
   * be a constant — its value changes per evaluation — and it must resolve by
   * name, because that is what a user types.
   */
  const ANS = { ans: { value: 20, unit: 'g/L', exponents: [1, -3, 0, 0, 0, 0] } };

  it('should resolve a variable by name', () => {
    expect(evaluate('ans', ANS).value).toBe(20);
  });

  it('should carry the variable\'s unit through arithmetic', () => {
    /*
     * The reason a variable holds a dimension and not just a number. After
     * `5 g / 250 mL` the answer is 20 g/L, and a bare number would silently
     * drop the unit — making `ans * 2` a dimensionless 40 that looks right
     * and means nothing.
     */
    const r = evaluate('ans * 2', ANS);
    expect(r.value).toBeCloseTo(40, 9);
    expect(r.unit).toBe('g/L');
  });

  it('should add a variable to a quantity of the same dimension', () => {
    const r = evaluate('ans + 5 g/L', ANS);
    expect(r.value).toBeCloseTo(25, 9);
  });

  it('should refuse to add a variable to a different dimension', () => {
    // Same rule as any other quantity: `20 g/L + 3 g` has no meaning.
    expect(() => evaluate('ans + 3 g', ANS)).toThrow();
  });

  it('should treat an unknown name as a unit, not as a variable', () => {
    // Without the vars map there is nothing to resolve, and the existing
    // behaviour — report it as an unrecognised unit — is the right error.
    expect(() => evaluate('ans * 2')).toThrow();
  });

  it('should not shadow the built-in constants', () => {
    // `pi` is checked after variables, so a caller that passes a variable named
    // `pi` gets theirs — but the default path still resolves the constant.
    expect(evaluate('pi').value).toBeCloseTo(Math.PI, 12);
    expect(evaluate('2 * pi').value).toBeCloseTo(2 * Math.PI, 12);
  });

  it('should leave a variable-free call unchanged', () => {
    // The second parameter is optional; every existing call site passes one.
    expect(evaluate('5 g / 250 mL').unit).toBe('g/L');
    expect(evaluate('2 + 3').value).toBe(5);
  });
});
