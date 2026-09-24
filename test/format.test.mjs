import { describe, it, expect } from 'vitest';
import { fmt, fmtSci, n, shownFor } from '../src/ui/format.mjs';

describe('n', () => {
  it('should treat a blank field as NaN rather than 0', () => {
    // A blank field means "not filled in". Reading it as zero would let a user
    // calculate with a value they never entered.
    expect(n('')).toBeNaN();
    expect(n('   ')).toBeNaN();
    expect(n(undefined)).toBeNaN();
  });

  it('should parse a number', () => {
    expect(n('0.5')).toBe(0.5);
    expect(n('5e-5')).toBe(5e-5);
    expect(n('-1')).toBe(-1);
  });
});

describe('fmt', () => {
  it('should trim trailing zeros', () => {
    expect(fmt(14.61, 4)).toBe('14.61');
  });

  it('should respect the digit count', () => {
    expect(fmt(1.2345, 2)).toBe('1.23');
    expect(fmt(0.1, 0)).toBe('0');
  });

  it('should format, not round half-up', () => {
    // Both of these are stored just below the .xx5 boundary (1.00499…,
    // 2.67499…), so toFixed truncates them down and the trailing zeros are
    // then trimmed to a bare "1". This is the language's behaviour, not a bug
    // in fmt — but it is why fmt must never round a value that feeds another
    // calculation: round first, format second.
    expect(fmt(1.005, 2)).toBe('1');
    expect(fmt(2.675, 2)).toBe('2.67');
    expect(fmt(2.676, 2)).toBe('2.68');
  });

  it('should render a non-finite value as a dash rather than NaN', () => {
    expect(fmt(NaN)).toBe('—');
    expect(fmt(Infinity)).toBe('—');
  });
});

describe('fmtSci', () => {
  it('should use an exponent above the ordinary range', () => {
    // 6.02214076e22 is what a particle count looks like, and fmt renders it as
    // the literal "6.02214076e+22" — readable to a programmer, not to someone
    // checking a bench sheet.
    expect(fmtSci(6.02214076e22)).toBe('6.022×10²²');
  });

  it('should use an exponent below the ordinary range', () => {
    expect(fmtSci(5e-5)).toBe('5×10⁻⁵');
  });

  it('should keep an ordinary number in plain decimal', () => {
    expect(fmtSci(1500)).toBe('1500');
    expect(fmtSci(0.2)).toBe('0.2');
  });

  it('should treat the range boundaries as ordinary', () => {
    expect(fmtSci(1e5)).toBe('100000');
    expect(fmtSci(1e-3)).toBe('0.001');
  });

  it('should carry the sign of a negative exponent', () => {
    expect(fmtSci(1.5e-9)).toBe('1.5×10⁻⁹');
  });

  it('should render a non-finite value as a dash', () => {
    expect(fmtSci(NaN)).toBe('—');
  });

  it('should leave zero alone rather than exponentiating it', () => {
    // 0 < 1e-3 is true, so a naive range check would send zero down the
    // exponent path and print "0×10⁰".
    expect(fmtSci(0)).toBe('0');
  });

  it('should not collapse a tiny concentration to zero', () => {
    // A serial dilution reaches 1e-16 by the eighth 1:100 tube. fmt rounds
    // that to "0", so the row claimed there was no solute in the tube — the
    // one number in the table a reader must not get wrong.
    expect(fmt(1e-16, 4)).toBe('0');
    expect(fmtSci(1e-16, 4)).toBe('1×10⁻¹⁶');
  });

  it('should keep every step of a real dilution series distinguishable', () => {
    // Eight 1:100 steps span 1e-16; under fmt the last several all read "0".
    const series = Array.from({ length: 8 }, (_, i) => 1 / 100 ** (i + 1));
    const rendered = series.map((c) => fmtSci(c, 4));
    expect(new Set(rendered).size).toBe(8);
    expect(rendered).not.toContain('0');
  });
});

describe('shownFor', () => {
  const out = { mode: 'stock', molarity: 12.08 };

  it('should return the result when its key matches', () => {
    expect(shownFor(out, 'mode', 'stock')).toBe(out);
  });

  it('should return null when the key differs', () => {
    // The reset effect runs after render, so a mode switch leaves the previous
    // mode's result in state for one frame. Returning it would paint 12.08 M
    // under the ionic-strength labels — and where the shapes differ, crash.
    expect(shownFor(out, 'mode', 'ionic')).toBeNull();
  });

  it('should return null for no result at all', () => {
    expect(shownFor(null, 'mode', 'stock')).toBeNull();
    expect(shownFor(undefined, 'mode', 'stock')).toBeNull();
  });

  it('should compare against the named key, not always `mode`', () => {
    // The pH tab switches between acid and base, which it stores as `kind`.
    const ph = { kind: 'acid', ph: 2.88 };
    expect(shownFor(ph, 'kind', 'acid')).toBe(ph);
    expect(shownFor(ph, 'kind', 'base')).toBeNull();
    // Asking for a key the result does not carry must not match on undefined.
    expect(shownFor(ph, 'mode', undefined)).toBeNull();
  });
});
