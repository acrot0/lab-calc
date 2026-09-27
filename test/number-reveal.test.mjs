import { describe, it, expect } from 'vitest';
import { maskedValue, REVEAL_MS } from '../src/ui/number-reveal.mjs';

describe('maskedValue', () => {
  it('should return the text unchanged when complete', () => {
    expect(maskedValue('58.440', 1)).toBe('58.440');
  });

  it('should return the text unchanged when progress overshoots', () => {
    expect(maskedValue('58.440', 1.4)).toBe('58.440');
  });

  it('should return the text unchanged for a non-finite progress', () => {
    expect(maskedValue('58.440', NaN)).toBe('58.440');
    expect(maskedValue('58.440', Infinity)).toBe('58.440');
  });

  it('should mask every digit at the start', () => {
    expect(maskedValue('58.440', 0)).toBe('··.···');
  });

  it('should keep the decimal point visible while the digits are masked', () => {
    // The point, and the sign, and the unit: they are the shape of the number,
    // and hiding them would make the panel unreadable rather than suspenseful.
    expect(maskedValue('58.440', 0)).toContain('.');
  });

  it('should keep a leading minus visible', () => {
    expect(maskedValue('-212.982', 0)).toBe('-···.···');
  });

  it('should keep a trailing unit visible', () => {
    expect(maskedValue('1.1037 V', 0)).toBe('·.···· V');
  });

  it('should keep an exponent marker visible', () => {
    expect(maskedValue('2.055×10³', 0)).toBe('·.···×··³');
  });

  it('should reveal digits from the left as progress rises', () => {
    const text = '12345';
    expect(maskedValue(text, 0.2)).toBe('1····');
    expect(maskedValue(text, 0.4)).toBe('12···');
    expect(maskedValue(text, 0.6)).toBe('123··');
    expect(maskedValue(text, 0.8)).toBe('1234·');
  });

  it('should never show a digit that is not in the final text', () => {
    // The whole reason this masks instead of counting up: every frame must be a
    // prefix of the answer, never a different number.
    const text = '58.440';
    for (let i = 0; i <= 20; i++) {
      const shown = maskedValue(text, i / 20);
      for (const ch of shown) {
        if (ch === '·') continue;
        expect(text).toContain(ch);
      }
    }
  });

  it('should never show a digit out of order', () => {
    const text = '58.440';
    const digitsOf = (s) => [...s].filter((c) => c >= '0' && c <= '9');
    const full = digitsOf(text);
    for (let i = 0; i <= 20; i++) {
      const shown = digitsOf(maskedValue(text, i / 20));
      expect(shown).toEqual(full.slice(0, shown.length));
    }
  });

  it('should grow monotonically: digits only ever appear', () => {
    const text = '1.1037';
    let prev = 0;
    for (let i = 0; i <= 20; i++) {
      const n = [...maskedValue(text, i / 20)].filter((c) => c >= '0' && c <= '9').length;
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });

  it('should return text with no digits unchanged at any progress', () => {
    expect(maskedValue('—', 0)).toBe('—');
    expect(maskedValue('', 0)).toBe('');
    expect(maskedValue('N/A', 0.5)).toBe('N/A');
  });

  it('should handle an em dash placeholder without inventing digits', () => {
    // A ratio can be undefined; the tab renders `—`. Masking must not turn that
    // into something that looks like a number.
    const shown = maskedValue('—', 0);
    expect(shown).not.toMatch(/[0-9]/);
  });

  it('should treat a negative progress as the start', () => {
    expect(maskedValue('12.3', -1)).toBe('··.·');
  });

  it('should coerce a non-string input', () => {
    expect(maskedValue(58.44, 1)).toBe('58.44');
  });

  it('should handle a null input', () => {
    expect(maskedValue(null, 0.5)).toBe('');
  });

  it('should keep the same number of characters as the final text', () => {
    // A layout shift on every frame would be worse than no animation: the
    // headline is the largest text on the page.
    for (const text of ['58.440', '-212.982', '1.1037 V', '2.055×10³', '—']) {
      for (let i = 0; i <= 10; i++) {
        expect(maskedValue(text, i / 10)).toHaveLength(text.length);
      }
    }
  });
});

describe('REVEAL_MS', () => {
  it('should be short enough not to delay reading the answer', () => {
    expect(REVEAL_MS).toBeGreaterThan(0);
    expect(REVEAL_MS).toBeLessThanOrEqual(300);
  });
});
