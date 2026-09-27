import { describe, it, expect } from 'vitest';
import { fmtMeasured } from '../src/ui/format.mjs';

/*
 * The display half of uncertainty propagation.
 *
 * `roundPair` decides the precision; this decides what the user reads. The two
 * can still disagree — a correct pair rendered with a fixed decimal count shows
 * digits the pair had already discarded — so the cases below are about the
 * rendered text, not the arithmetic.
 */

describe('fmtMeasured', () => {
  it('should round the value to the place the uncertainty occupies', () => {
    // 5.843721 ± 0.0012 is 5.8437 ± 0.0012. The value must lose the digits
    // past the uncertainty's last significant figure.
    const { text, uncText } = fmtMeasured(5.843721, 0.0012);
    expect(text).toBe('5.8437');
    expect(uncText).toBe('± 0.0012');
  });

  it('should not show digits the uncertainty has already discarded', () => {
    // The failure this catches: a fixed 4-decimal format renders 0.1024 ± 0.04
    // as "0.1024 ± 0.04", which claims two digits nobody measured.
    const { text, uncText } = fmtMeasured(0.10237, 0.04);
    expect(text).toBe('0.1');
    expect(uncText).toBe('± 0.04');
  });

  it('should keep two figures on an uncertainty starting with 1 or 2', () => {
    // 0.12 and 0.13 differ by enough to change a decision; the convention keeps
    // the second figure exactly here.
    const { uncText } = fmtMeasured(1.23456, 0.012);
    expect(uncText).toBe('± 0.012');
  });

  it('should keep one figure on an uncertainty starting with a larger digit', () => {
    const { uncText } = fmtMeasured(1.23456, 0.041);
    expect(uncText).toBe('± 0.04');
  });

  it('should leave an exact value at the caller’s precision', () => {
    // No uncertainty means no limit from this path — a count, a definition.
    const { text, uncText } = fmtMeasured(58.44, 0, { digits: 4 });
    expect(text).toBe('58.44');
    expect(uncText).toBe('');
  });

  it('should render a small value without exponential notation', () => {
    // 0.000456 ± 0.000012: both are ordinary quantities at the bench, and
    // 4.56e-4 in a result is not how anyone writes it down.
    const { text, uncText } = fmtMeasured(0.0004563, 0.000012);
    expect(text).toBe('0.000456');
    expect(uncText).toBe('± 0.000012');
  });

  it('should carry a unit on both halves', () => {
    const { text, uncText } = fmtMeasured(5.8437, 0.0012, { unit: ' g' });
    expect(text).toBe('5.8437 g');
    expect(uncText).toBe('± 0.0012 g');
  });

  it('should render a non-finite value as a dash rather than NaN', () => {
    expect(fmtMeasured(NaN, 0.1).text).toBe('—');
    expect(fmtMeasured(Infinity, 0.1).text).toBe('—');
  });

  it('should agree with the pair the engine rounds to', async () => {
    // The property that matters: the rendered text is the rounded pair, not a
    // re-rounded one. A second rounding is where the last digit drifts.
    const { roundPair } = await import('../src/calc/uncertainty.mjs');
    for (const [v, u] of [[5.843721, 0.0012], [0.10237, 0.04], [1234.5678, 12], [0.0004563, 0.000012]]) {
      const pair = roundPair({ value: v, unc: u });
      const { text } = fmtMeasured(v, u);
      expect(Number(text)).toBeCloseTo(pair.value, 12);
    }
  });
});
