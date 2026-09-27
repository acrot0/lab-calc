import { describe, it, expect } from 'vitest';
import { bufferCapacity, bufferCapacityCurve } from '../src/calc/buffer.mjs';

/*
 * Buffer capacity — the Van Slyke equation.
 *
 *   β = dCb/dpH = 2.303 · C · Ka[H⁺] / (Ka + [H⁺])²  +  2.303 · ([H⁺] + [OH⁻])
 *
 * The first term is the buffer pair; the second is water's own resistance, which
 * is negligible near neutral pH and dominant at the extremes. Both are kept
 * because a capacity quoted without the water term is wrong at the ends of the
 * range — and the ends are exactly where a user is checking whether their buffer
 * still works.
 *
 * The reference values below are the ones every textbook quotes, which is the
 * point: a formula whose answers nobody can look up is a formula nobody can
 * check.
 */

describe('bufferCapacity', () => {
  it('should peak at pH = pKa, where β = 0.576 C', () => {
    // The maximum is the one number a reader can verify from memory:
    // β_max = 2.303 C / 4 = 0.5756 C. A 0.1 M acetate buffer at its pKa of 4.76
    // gives 0.0576 mol/L per pH unit.
    const r = bufferCapacity({ pKa: 4.76, totalConc: 0.1, ph: 4.76 });
    expect(r.buffer).toBeCloseTo(0.0576, 4);
    expect(r.fraction).toBeCloseTo(1, 2);
  });

  it('should fall to about a third of maximum one pH unit away', () => {
    // 1:10 ratio → β/β_max ≈ 0.33. This is why the useful range is pKa ± 1.
    const r = bufferCapacity({ pKa: 4.76, totalConc: 0.1, ph: 5.76 });
    expect(r.fraction).toBeCloseTo(0.33, 1);
  });

  it('should be symmetric about the pKa', () => {
    // The ratio inverts but the capacity does not depend on which side.
    const below = bufferCapacity({ pKa: 4.76, totalConc: 0.1, ph: 4.76 - 0.4 });
    const above = bufferCapacity({ pKa: 4.76, totalConc: 0.1, ph: 4.76 + 0.4 });
    expect(above.buffer).toBeCloseTo(below.buffer, 10);
  });

  it('should scale linearly with concentration', () => {
    const a = bufferCapacity({ pKa: 4.76, totalConc: 0.1, ph: 4.76 });
    const b = bufferCapacity({ pKa: 4.76, totalConc: 0.2, ph: 4.76 });
    expect(b.buffer).toBeCloseTo(a.buffer * 2, 10);
  });

  it('should include the water term, which dominates far from the pKa', () => {
    // At pH 12 with a buffer whose pKa is 4.76 the pair contributes almost
    // nothing, and hydroxide is what actually resists a change.
    const r = bufferCapacity({ pKa: 4.76, totalConc: 0.1, ph: 12 });
    expect(r.water).toBeGreaterThan(r.buffer);
    expect(r.total).toBeCloseTo(r.buffer + r.water, 12);
  });

  it('should report the acid and base concentrations behind the number', () => {
    // The working has to show where the ratio came from, not just the total.
    const r = bufferCapacity({ pKa: 4.76, totalConc: 0.1, ph: 4.76 });
    expect(r.acidConc).toBeCloseTo(0.05, 10);
    expect(r.baseConc).toBeCloseTo(0.05, 10);
  });

  it('should refuse a non-positive concentration', () => {
    expect(() => bufferCapacity({ pKa: 4.76, totalConc: 0, ph: 4.76 })).toThrow();
    expect(() => bufferCapacity({ pKa: 4.76, totalConc: -1, ph: 4.76 })).toThrow();
  });

  it('should refuse a pH outside the scale it can represent', () => {
    // [H⁺] beyond 1 M is not a buffer anyone makes, and the water term stops
    // being an approximation of anything.
    expect(() => bufferCapacity({ pKa: 4.76, totalConc: 0.1, ph: 15 })).toThrow();
    expect(() => bufferCapacity({ pKa: 4.76, totalConc: 0.1, ph: -2 })).toThrow();
  });
});

describe('bufferCapacityCurve', () => {
  it('should sample the range and mark where the maximum sits', () => {
    const c = bufferCapacityCurve({ pKa: 4.76, totalConc: 0.1 });
    expect(c.points.length).toBeGreaterThan(20);
    // The peak of the sampled curve should land on the pKa.
    const peak = c.points.reduce((a, b) => (b.total > a.total ? b : a));
    expect(peak.ph).toBeCloseTo(4.76, 1);
  });

  it('should peak at the pKa and fall away on both sides', () => {
    const { points } = bufferCapacityCurve({ pKa: 7.2, totalConc: 0.05 });
    const peak = points.reduce((a, b) => (b.total > a.total ? b : a));
    expect(peak.ph).toBeCloseTo(7.2, 6);
    // Strictly lower at both ends of the sampled range.
    expect(points[0].total).toBeLessThan(peak.total);
    expect(points[points.length - 1].total).toBeLessThan(peak.total);
  });

  it('should be monotonic in the buffer term alone', () => {
    // Only the pair term is monotonic either side of the peak. The total is
    // not, and asserting that it were was wrong: at the acid end the water
    // term dominates, so the curve *falls* before it rises — [H⁺] drops as pH
    // climbs, and water is what is doing the resisting out there.
    const { points } = bufferCapacityCurve({ pKa: 7.2, totalConc: 0.05 });
    // The sampled maximum, not `findIndex(ph >= pKa)` — with an even point
    // count no sample lands exactly on the pKa, and the first one past it is
    // already on the way down.
    const peakIdx = points.reduce((best, p, i) => (p.buffer > points[best].buffer ? i : best), 0);
    for (let i = 1; i <= peakIdx; i += 1) {
      expect(points[i].buffer, `buffer rising at ${points[i].ph}`)
        .toBeGreaterThanOrEqual(points[i - 1].buffer - 1e-15);
    }
    for (let i = peakIdx + 1; i < points.length; i += 1) {
      expect(points[i].buffer, `buffer falling at ${points[i].ph}`)
        .toBeLessThanOrEqual(points[i - 1].buffer + 1e-15);
    }
  });

  it('should dip before it rises, where water takes over', () => {
    // The shape that surprises people, pinned so it is not "fixed" later.
    const { points } = bufferCapacityCurve({ pKa: 7.2, totalConc: 0.05 });
    const first = points[0];
    const min = points.reduce((a, b) => (b.total < a.total ? b : a));
    expect(min.ph).toBeGreaterThan(first.ph);
    expect(min.total).toBeLessThan(first.total);
  });
});
