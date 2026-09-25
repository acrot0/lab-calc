import { describe, expect, it } from 'vitest';
import {
  evaluate, looksLikeExpression, tryEvaluate,
} from '../src/calc/expression.mjs';

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
