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
