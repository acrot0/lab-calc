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

describe('fmtMeasured bare halves', () => {
  /*
   * The panel renders the unit as its own element so it can be styled apart
   * from the digits, so it needs the number without one. These two properties
   * are what the result card depends on; without them the unit printed twice.
   */
  it('should return the value with no unit when a unit was given', () => {
    const p = fmtMeasured(5.8437, 0.0012, { unit: ' g' });
    expect(p.value).toBe('5.8437');
    expect(p.uncValue).toBe('± 0.0012');
    // The combined halves keep the unit for the callers that want one string.
    expect(p.text).toBe('5.8437 g');
    expect(p.uncText).toBe('± 0.0012 g');
  });

  it('should return a bare pair for an exact value too', () => {
    const p = fmtMeasured(58.44, 0, { unit: ' g/mol' });
    expect(p.value).toBe('58.44');
    expect(p.uncValue).toBe('');
  });
});

describe('the result panel\'s precision agreement', () => {
  /*
   * The defect this pins, measured on the shipped build by weighing 14.6099 g
   * with a balance whose combined standard uncertainty is ±0.00017 g:
   *
   *     14.61 g        ← the tab's own fmtSci(out.massG, 3)
   *     ± 0.00017 g    ← roundPair, which put the value at 14.6099
   *
   * The panel's headline came from the tab and the ± line came from the
   * uncertainty, so the two were rounded independently and disagreed by two
   * decimal places. The card asserted a resolution it did not display.
   *
   * `Result` now takes the headline from the same pair the ± line comes from.
   * What can be asserted here, without a DOM, is the property that makes that
   * safe: whenever an uncertainty is present, the pair's value is the one the
   * uncertainty allows — never a separately-rounded coarse one.
   */
  it('should put the value at the uncertainty\'s decimal place, not a fixed 3', async () => {
    const { roundPair } = await import('../src/calc/uncertainty.mjs');
    const value = 14.6099;
    const unc = 0.00017;
    const pair = roundPair({ value, unc });
    const p = fmtMeasured(value, unc, { unit: ' g' });
    // The headline is the pair's value...
    expect(Number(p.value)).toBeCloseTo(pair.value, 12);
    // ...and explicitly not what a 3-significant-figure format would give.
    expect(p.value).not.toBe('14.61');
  });

  it('should round both halves to the same absolute place', async () => {
    /*
     * The invariant that actually holds, and the one the card depends on. It is
     * NOT equal decimal counts: `fmt` trims trailing zeros, so 14.6099 against
     * ± 0.00017 has four decimals on one side and five on the other while both
     * still end at the ten-thousandths. Comparing digit counts would fail on
     * correct output.
     *
     * The place is the uncertainty's last significant figure, so dividing both
     * by that power of ten must land on integers.
     */
    const { roundPair } = await import('../src/calc/uncertainty.mjs');
    const cases = [[14.6099, 0.00017], [5.843721, 0.0012], [0.10237, 0.04], [14.6099, 0.05], [1234.5678, 12]];
    for (const [v, u] of cases) {
      const pair = roundPair({ value: v, unc: u });
      const p = fmtMeasured(v, u);
      const digits = String(pair.unc).replace(/^-?0\.?/, '').replace(/0+$/, '').length;
      const scale = 10 ** (Math.floor(Math.log10(Math.abs(pair.unc))) - (digits - 1));
      const atPlace = (x) => Math.round(x / scale);
      expect(atPlace(Number(p.value)), `${v} ± ${u}`).toBe(atPlace(pair.value));
      expect(atPlace(Number(p.uncValue.replace('± ', ''))), `${v} ± ${u}`).toBe(atPlace(pair.unc));
    }
  });

  it('should still agree when the uncertainty is coarse', async () => {
    // The case the old assumption was written for: a coarse uncertainty lands
    // on fewer figures than fmtSci(x, 3), so the two happened to match and the
    // bug stayed hidden. Both must still agree here.
    const { roundPair } = await import('../src/calc/uncertainty.mjs');
    const value = 14.6099;
    const unc = 0.05;
    const pair = roundPair({ value, unc });
    const p = fmtMeasured(value, unc, { unit: ' g' });
    expect(Number(p.value)).toBeCloseTo(pair.value, 12);
    expect(p.value).toBe('14.61');
  });
});
