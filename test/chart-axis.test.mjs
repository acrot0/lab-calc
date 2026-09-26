import { describe, it, expect } from 'vitest';
import { niceTicks } from '../src/ui/components/chart-axis.mjs';

/**
 * Axis ticks, shared by the canvas charts.
 *
 * The charts themselves are canvas and not worth asserting on, but the tick
 * arithmetic is pure and is where the bugs are: an axis labelled 0.37 / 0.74 /
 * 1.11 is arithmetically correct and useless to read.
 */

describe('niceTicks', () => {
  it('should produce round numbers for a round range', () => {
    expect(niceTicks(10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('should land on 1, 2 or 5 times a power of ten', () => {
    // The whole point: a reader can do arithmetic with these.
    for (const max of [1, 3, 7, 12, 45, 130, 0.8, 0.03, 2.5e4]) {
      const ticks = niceTicks(max, 4);
      const step = ticks[1] - ticks[0];
      const mantissa = step / 10 ** Math.floor(Math.log10(step));
      expect([1, 2, 5, 10], `max=${max} step=${step}`).toContain(Math.round(mantissa));
    }
  });

  it('should start at zero and not exceed the range by more than one step', () => {
    for (const max of [1, 7, 12, 130, 0.03]) {
      const ticks = niceTicks(max, 5);
      const step = ticks[1] - ticks[0];
      expect(ticks[0], `max=${max}`).toBe(0);
      expect(ticks.at(-1), `max=${max}`).toBeLessThanOrEqual(max + step);
    }
  });

  it('should not accumulate floating-point noise', () => {
    /*
     * A naive `for (v = 0; v <= max; v += 0.1)` produces 0.30000000000000004,
     * which the canvas would then print as a tick label.
     */
    for (const t of niceTicks(0.5, 5)) {
      expect(String(t).length, `tick ${t}`).toBeLessThan(6);
    }
    expect(niceTicks(0.5, 5)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it('should handle a small range without collapsing to a single tick', () => {
    const ticks = niceTicks(0.004, 4);
    expect(ticks.length).toBeGreaterThan(2);
  });

  it('should handle a large range', () => {
    const ticks = niceTicks(1e6, 5);
    expect(ticks.length).toBeGreaterThan(3);
    expect(ticks.at(-1)).toBeLessThanOrEqual(1.2e6);
  });

  it('should return a single zero tick for a non-positive range', () => {
    // A degenerate fit — all rates zero — must not produce NaN labels or an
    // infinite loop.
    expect(niceTicks(0, 5)).toEqual([0]);
    expect(niceTicks(-5, 5)).toEqual([0]);
    expect(niceTicks(NaN, 5)).toEqual([0]);
  });

  it('should honour the requested tick count approximately', () => {
    // Not exactly — the step is rounded to a nice number — but within one.
    for (const count of [3, 4, 5, 6]) {
      const ticks = niceTicks(100, count);
      expect(Math.abs(ticks.length - 1 - count), `count=${count}`).toBeLessThanOrEqual(2);
    }
  });
});

describe('niceTicks with a non-zero minimum', () => {
  it('should shift the sequence so ticks land on round numbers', () => {
    // The Nernst line runs over negative log Q. Measuring the step from zero
    // would put ticks at −5, 0, 5 and leave the plotted range unlabelled.
    expect(niceTicks(1, 5, -4)).toEqual([-4, -3, -2, -1, 0, 1]);
    // A coarser step is still measured from the minimum, not from zero.
    expect(niceTicks(1, 4, -4)).toEqual([-4, -2, 0]);
  });

  it('should never emit a tick below the minimum', () => {
    for (const [min, max] of [[-4, 1], [-0.7, 2.3], [3, 3.05], [-12, -8]]) {
      for (const v of niceTicks(max, 5, min)) {
        expect(v, `min=${min} max=${max}`).toBeGreaterThanOrEqual(min - 1e-9);
        expect(v, `min=${min} max=${max}`).toBeLessThanOrEqual(max + 1e-9);
      }
    }
  });

  it('should return the minimum alone for a degenerate range', () => {
    expect(niceTicks(5, 5, 5)).toEqual([5]);
    expect(niceTicks(-1, 5, 3)).toEqual([3]);
  });

  it('should keep the plain case identical to before', () => {
    // The default min = 0 path is what every existing chart uses, and the
    // extraction must not have moved it.
    expect(niceTicks(10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(0.5, 5)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
  });
});
