import { describe, it, expect } from 'vitest';
import { niceTicks } from '../src/ui/components/KineticsPlot.jsx';

/**
 * Axis ticks.
 *
 * The chart itself is canvas and not worth asserting on, but the tick
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
