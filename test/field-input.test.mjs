import { describe, it, expect } from 'vitest';
import { readNumberField, safeEvaluate } from '../src/ui/field-input.mjs';

/**
 * The number field's reader, tested as the decision it is.
 *
 * Every case here is a string a user can actually produce — by typing it, or by
 * pasting it out of Word, Excel, a PDF, a slide, or a Chinese IME. The paste
 * cases are the reason the module exists: the previous implementation silently
 * truncated them.
 */

describe('readNumberField: plain numbers', () => {
  it('should read an integer', () => {
    expect(readNumberField('250')).toBe(250);
  });

  it('should read a decimal', () => {
    expect(readNumberField('0.5')).toBe(0.5);
  });

  it('should read a leading-dot decimal', () => {
    expect(readNumberField('.5')).toBe(0.5);
  });

  it('should read a negative number', () => {
    expect(readNumberField('-273.15')).toBe(-273.15);
  });

  it('should read exponent notation', () => {
    expect(readNumberField('1e-3')).toBe(0.001);
    expect(readNumberField('2E3')).toBe(2000);
  });

  it('should read a trailing dot, which a user types on the way to a decimal', () => {
    // `5.` is not a number the parser takes, but it is a state the field is in
    // for the half-second before the `5` is typed. Refusing it would clear the
    // tab's value while the user is still typing.
    expect(readNumberField('5.')).toBe(5);
  });

  it('should ignore surrounding whitespace', () => {
    expect(readNumberField('  0.5  ')).toBe(0.5);
  });
});

describe('readNumberField: pasted from a spreadsheet', () => {
  it('should read a comma-grouped number rather than truncating it', () => {
    // The bug this module was written for: `parseFloat('1,234.5')` is 1.
    expect(readNumberField('1,234.5')).toBe(1234.5);
  });

  it('should read a comma-grouped integer', () => {
    expect(readNumberField('1,000')).toBe(1000);
  });

  it('should read several groups', () => {
    expect(readNumberField('1,234,567.89')).toBe(1234567.89);
  });

  it('should read a space-grouped number, which is the SI style', () => {
    expect(readNumberField('1 234.5')).toBe(1234.5);
    expect(readNumberField('1 234 567')).toBe(1234567);
  });

  it('should read a non-breaking space as a grouping separator', () => {
    // Excel and Word use U+00A0, not U+0020, and the two are indistinguishable
    // on screen. A paste from either must land on the same value.
    expect(readNumberField('1 234.5')).toBe(1234.5);
  });
});

describe('readNumberField: pasted from a word processor', () => {
  it('should read typographic multiplication and division', () => {
    expect(readNumberField('0.1 × 250 ÷ 58.44')).toBeCloseTo(0.4277891855, 9);
  });

  it('should read the Unicode minus sign', () => {
    expect(readNumberField('2−3')).toBe(-1);
  });

  it('should read an en dash or an em dash as minus', () => {
    // A word processor picks between four dash characters by context, and all
    // four mean "minus" between two numbers.
    expect(readNumberField('5 – 3')).toBe(2);
    expect(readNumberField('5 — 3')).toBe(2);
  });

  it('should read fullwidth digits and operators', () => {
    // A Chinese IME produces these by default and they are indistinguishable
    // from ASCII in the input box.
    expect(readNumberField('１２＋３')).toBe(15);
    expect(readNumberField('２．５')).toBe(2.5);
  });

  it('should read fullwidth parentheses', () => {
    expect(readNumberField('（2+3）')).toBe(5);
  });

  it('should read a superscript exponent', () => {
    expect(readNumberField('10⁻³')).toBe(0.001);
  });
});

describe('readNumberField: expressions', () => {
  it('should evaluate an arithmetic expression', () => {
    expect(readNumberField('0.1*250/58.44')).toBeCloseTo(0.4277891855, 9);
  });

  it('should evaluate a function call', () => {
    expect(readNumberField('sqrt(16)')).toBe(4);
  });

  it('should refuse an expression whose result carries a dimension', () => {
    // `5 g / 250 mL` is a concentration. Putting 20 into a box labelled
    // "volume in mL" would be putting a number where a different kind of
    // quantity belongs, and the tab would then compute with it.
    expect(readNumberField('5 g / 250 mL')).toBeNull();
  });

  it('should refuse a bare number with a unit', () => {
    expect(readNumberField('250 mL')).toBeNull();
  });
});

describe('readNumberField: text that is not a number', () => {
  it('should refuse a partial grouping rather than reading it as a smaller number', () => {
    // `1,00` is not a thousand-grouped number. `parseFloat` would return 1.
    expect(readNumberField('1,00')).toBeNull();
  });

  it('should refuse two numbers separated by a space', () => {
    expect(readNumberField('2 3')).toBeNull();
  });

  it('should refuse a hex literal rather than reading it as zero', () => {
    // `parseFloat('0x10')` is 0, and a field that quietly holds zero because
    // the user typed `0x10` is a field that has been silently corrupted.
    expect(readNumberField('0x10')).toBeNull();
  });

  it('should refuse a malformed decimal', () => {
    expect(readNumberField('1.2.3')).toBeNull();
  });

  it('should refuse an empty string', () => {
    expect(readNumberField('')).toBeNull();
    expect(readNumberField('   ')).toBeNull();
  });

  it('should refuse null and undefined without throwing', () => {
    expect(readNumberField(null)).toBeNull();
    expect(readNumberField(undefined)).toBeNull();
  });

  it('should refuse arbitrary text', () => {
    expect(readNumberField('NaCl')).toBeNull();
  });
});

describe('safeEvaluate', () => {
  it('should return the value of a dimensionless expression', () => {
    expect(safeEvaluate('2+3')).toBe(5);
  });

  it('should return null for a dimensioned result', () => {
    expect(safeEvaluate('5 g')).toBeNull();
  });

  it('should return null for a parse failure rather than throwing', () => {
    expect(safeEvaluate('2+')).toBeNull();
  });
});
