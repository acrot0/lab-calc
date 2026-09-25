import { describe, it, expect } from 'vitest';
import {
  COLOR_PROPERTIES,
  NUMERIC_KEYS,
  LOG_THRESHOLD,
  valueOf,
  rangeOf,
  positionOf,
  ticksOf,
  fitTicks,
} from '../src/ui/heat.mjs';
import { ELEMENTS } from '../src/calc/elements.mjs';
import { propertiesOf } from '../src/calc/element-properties.mjs';

const propsFor = (el) => propertiesOf(el.number);

describe('COLOR_PROPERTIES', () => {
  it('should declare where each value is read from', () => {
    // Two source tables: the element list carries atomic weight and radii,
    // PubChem's data carries the physical properties. A mode pointing at the
    // wrong one reads undefined and shades every cell the same.
    for (const [mode, spec] of Object.entries(COLOR_PROPERTIES)) {
      expect(['element', 'properties'], mode).toContain(spec.from);
      expect(typeof spec.key, mode).toBe('string');
      expect(typeof spec.unit, mode).toBe('string');
    }
  });

  it('should expose every mode as a selectable key', () => {
    expect(NUMERIC_KEYS).toEqual(Object.keys(COLOR_PROPERTIES));
  });
});

describe('valueOf', () => {
  it('should read an element-table property', () => {
    const carbon = ELEMENTS.find((e) => e.symbol === 'C');
    expect(valueOf(carbon, propsFor(carbon), 'mass')).toBe(12.011);
  });

  it('should read a PubChem property', () => {
    const carbon = ELEMENTS.find((e) => e.symbol === 'C');
    expect(valueOf(carbon, propsFor(carbon), 'melt')).toBe(3823);
  });

  it('should return null rather than zero for an unmeasured property', () => {
    // An element whose electronegativity has never been determined is not the
    // least electronegative one; treating null as 0 would put it at the bottom
    // of the ramp and assert a value nobody has measured.
    const helium = ELEMENTS.find((e) => e.symbol === 'He');
    expect(valueOf(helium, propsFor(helium), 'electronegativity')).toBeNull();
  });

  it('should return null for an unknown mode instead of throwing', () => {
    const carbon = ELEMENTS.find((e) => e.symbol === 'C');
    expect(valueOf(carbon, propsFor(carbon), 'nope')).toBeNull();
  });
});

describe('rangeOf', () => {
  it('should pick a linear scale for a narrow range', () => {
    // Electronegativity spans 0.7 to 3.98 — a factor of 5.7.
    const r = rangeOf(ELEMENTS, propsFor, 'electronegativity');
    expect(r.log).toBe(false);
    expect(r.min).toBeCloseTo(0.7, 3);
    expect(r.max).toBeCloseTo(3.98, 3);
  });

  it('should pick a logarithmic scale for a wide range', () => {
    // Density spans 8.99e-5 to 22.57 — a factor of 251,000. On a linear ramp
    // the gases collapse into the bottom pixel of the scale, which reads as
    // "all equally light" rather than "not resolved".
    const r = rangeOf(ELEMENTS, propsFor, 'density');
    expect(r.log).toBe(true);
  });

  it('should switch exactly at the declared threshold', () => {
    // The boundary is a judgement, so it is pinned here: if someone changes
    // LOG_THRESHOLD the scale for every property must be re-checked.
    const at = { min: 1, max: LOG_THRESHOLD };
    const under = { min: 1, max: LOG_THRESHOLD - 1 };
    const f = (el) => el;
    const els = (r) => [{ number: 1, mass: r.min }, { number: 2, mass: r.max }];
    expect(rangeOf(els(at), f, 'mass').log).toBe(true);
    expect(rangeOf(els(under), f, 'mass').log).toBe(false);
  });

  it('should report how many elements actually have a value', () => {
    // Density is measured for 96 of 118. An unlabelled ramp would read as if
    // it covered the whole table.
    const r = rangeOf(ELEMENTS, propsFor, 'density');
    expect(r.count).toBeGreaterThan(0);
    expect(r.count).toBeLessThan(ELEMENTS.length);
  });

  it('should not divide by zero when nothing has a value', () => {
    const r = rangeOf(ELEMENTS, () => ({}), 'melt');
    expect(r).toEqual({ min: 0, max: 1, log: false, count: 0 });
  });
});

describe('positionOf', () => {
  const linear = { min: 0, max: 10, log: false };
  const log = { min: 1e-4, max: 1, log: true };

  it('should map the ends of a linear range to 0 and 1', () => {
    expect(positionOf(0, linear)).toBe(0);
    expect(positionOf(10, linear)).toBe(1);
  });

  it('should map the ends of a log range to 0 and 1', () => {
    expect(positionOf(1e-4, log)).toBeCloseTo(0, 10);
    expect(positionOf(1, log)).toBeCloseTo(1, 10);
  });

  it('should place the midpoint of a log range at the geometric mean', () => {
    // This is the whole point of the log scale: 0.01 is halfway between 1e-4
    // and 1 in orders of magnitude, not at 0.5 linearly.
    expect(positionOf(0.01, log)).toBeCloseTo(0.5, 10);
  });

  it('should return null for a missing value', () => {
    expect(positionOf(null, linear)).toBeNull();
  });

  it('should return null rather than -Infinity for zero on a log scale', () => {
    // log10(0) is -Infinity, which would render as an invalid colour string
    // rather than as a visible failure.
    expect(positionOf(0, log)).toBeNull();
  });

  it('should centre a degenerate range instead of dividing by zero', () => {
    expect(positionOf(5, { min: 5, max: 5, log: false })).toBe(0.5);
  });
});

describe('ticksOf', () => {
  it('should give round numbers on a linear scale', () => {
    const t = ticksOf({ min: 0, max: 100, log: false }, 4);
    expect(t).toEqual([0, 100 / 3, 200 / 3, 100]);
  });

  it('should give exact powers of ten on a log scale', () => {
    // `10 ** -4` is 0.00009999999999999999, so the intermediate ticks are
    // built by parsing "1e-4" — a legend label must be the value it means.
    // Six slots over four decades, so every tick is a whole decade.
    const t = ticksOf({ min: 1e-4, max: 1, log: true }, 6);
    expect(t).toEqual([1e-4, 1e-3, 1e-2, 1e-1, 1]);
    for (const v of t) {
      expect(Math.log10(v)).toBeCloseTo(Math.round(Math.log10(v)), 10);
    }
  });

  it('should always include the true range ends', () => {
    // Density runs 8.99e-5 to 22.57: neither end is a round power of ten, and
    // a legend that rounds them misstates the span of the ramp.
    const t = ticksOf({ min: 8.99e-5, max: 22.57, log: true });
    expect(t[0]).toBe(8.99e-5);
    expect(t[t.length - 1]).toBe(22.57);
  });

  it('should fall back to the ends when a log range spans no decade', () => {
    expect(ticksOf({ min: 2, max: 5, log: true })).toEqual([2, 5]);
  });
});

describe('fitTicks', () => {
  it('should keep both ends whatever the spacing', () => {
    // The ends are the ramp's claim about its own span; thinning one away
    // would leave the legend unable to say where the scale stops.
    for (const range of [
      { min: 0, max: 100, log: false },
      { min: 8.99e-5, max: 22.57, log: true },
      { min: 1e-4, max: 1, log: true },
    ]) {
      const kept = fitTicks(range);
      expect(kept[0].value).toBeCloseTo(range.min, 12);
      expect(kept[kept.length - 1].value).toBeCloseTo(range.max, 12);
    }
  });

  it('should thin a tick that would sit on the end', () => {
    /*
     * The case this exists for. Density spans 8.99e-5 to 22.57 over six
     * decades, so 1e-4 lands 1.6% along the ramp — its label would collide
     * with the "8.99×10⁻⁵" label at the left edge.
     */
    const kept = fitTicks({ min: 8.99e-5, max: 22.57, log: true });
    const values = kept.map((k) => k.value);
    expect(values).toContain(8.99e-5);
    expect(values).toContain(22.57);
    expect(values).not.toContain(1e-4);
  });

  it('should keep ticks that are far enough apart', () => {
    const kept = fitTicks({ min: 1e-4, max: 1, log: true });
    expect(kept.map((k) => k.value)).toEqual([1e-4, 1e-2, 1]);
  });

  it('should report each tick with the position it marks', () => {
    // The caller places labels by these positions, so a tick whose position
    // disagrees with its value would label the ramp wrongly.
    const kept = fitTicks({ min: 1e-4, max: 1, log: true });
    for (const k of kept) {
      expect(k.pos).toBeCloseTo(positionOf(k.value, { min: 1e-4, max: 1, log: true }), 12);
    }
  });
});
