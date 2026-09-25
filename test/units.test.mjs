import { describe, expect, it } from 'vitest';
import {
  DIMENSIONS, EXPONENTS, TEMPERATURE_UNITS, UNITS, UNIT_SYMBOLS,
  convert, dimensionOf, dimensionFromExponents, exponentsOf, isDimensionless,
  nameExponents, unitsOf,
} from '../src/calc/units.mjs';

describe('unit tables', () => {
  it('should give every unit a dimension the dimension table knows', () => {
    // A unit whose dimension is not declared would be unreachable by the
    // pickers and would fail the dimension lookup at evaluation time, so the
    // two tables have to agree.
    for (const [symbol, u] of Object.entries(UNITS)) {
      expect(DIMENSIONS[u.dim], `${symbol} -> ${u.dim}`).toBeTruthy();
      expect(Number.isFinite(u.factor), `${symbol} factor`).toBe(true);
      expect(u.factor, `${symbol} factor is zero`).not.toBe(0);
    }
  });

  it('should give every dimension at least one unit and an exponent vector', () => {
    for (const dim of Object.keys(DIMENSIONS)) {
      expect(EXPONENTS[dim], `${dim} exponents`).toBeTruthy();
      expect(EXPONENTS[dim], `${dim} vector length`).toHaveLength(6);
      expect(unitsOf(dim).length, `${dim} has no units`).toBeGreaterThan(0);
    }
  });

  it('should keep every exponent vector distinct', () => {
    // Two dimensions with the same vector would be indistinguishable, so a
    // conversion between them would look valid and be nonsense. This is what
    // caught molarity and mass-per-volume being wrongly merged into one.
    const seen = new Map();
    for (const [dim, exp] of Object.entries(EXPONENTS)) {
      const key = exp.join(',');
      expect(seen.has(key), `${dim} and ${seen.get(key)} share a vector`).toBe(false);
      seen.set(key, dim);
    }
  });

  it('should have exactly one base unit per dimension', () => {
    for (const [dim, spec] of Object.entries(DIMENSIONS)) {
      const units = unitsOf(dim);
      expect(units, `${dim} base ${spec.base} is not a unit of ${dim}`).toContain(spec.base);
    }
  });

  it('should cover the eleven dimensions the converter offers', () => {
    for (const dim of [
      'mass', 'volume', 'molarity', 'massConcentration', 'length',
      'time', 'temperature', 'pressure', 'energy', 'voltage', 'resistance',
    ]) {
      expect(DIMENSIONS[dim], dim).toBeTruthy();
    }
  });

  it('should offer imperial units alongside metric ones', () => {
    // The user's report: the converter only did metric, so an imperial reading
    // had nowhere to go. These are the pairs that matter.
    const pairs = [
      ['lb', 'g'], ['oz', 'g'], ['gal', 'L'], ['qt', 'L'],
      ['floz', 'mL'], ['in', 'cm'], ['ft', 'm'], ['mi', 'km'], ['psi', 'kPa'],
    ];
    for (const [a, b] of pairs) {
      expect(UNITS[a], a).toBeTruthy();
      expect(UNITS[b], b).toBeTruthy();
      expect(UNITS[a].dim, `${a} vs ${b}`).toBe(UNITS[b].dim);
    }
  });
});

describe('convert', () => {
  it('should convert within a dimension', () => {
    expect(convert(1, 'g', 'mg')).toBeCloseTo(1000, 9);
    expect(convert(1, 'L', 'mL')).toBeCloseTo(1000, 9);
    expect(convert(1, 'M', 'mM')).toBeCloseTo(1000, 9);
    expect(convert(1, 'mol', 'mmol')).toBeCloseTo(1000, 9);
  });

  it('should convert the imperial units against their definitions', () => {
    // Each is an exact definition, not a measurement, so they are checked to
    // more places than a measurement would justify.
    expect(convert(1, 'lb', 'g')).toBeCloseTo(453.59237, 5);
    expect(convert(1, 'in', 'cm')).toBeCloseTo(2.54, 9);
    expect(convert(1, 'ft', 'm')).toBeCloseTo(0.3048, 9);
    expect(convert(1, 'gal', 'L')).toBeCloseTo(3.785411784, 8);
    expect(convert(1, 'mi', 'km')).toBeCloseTo(1.609344, 9);
    expect(convert(1, 'psi', 'Pa')).toBeCloseTo(6894.757293168, 5);
  });

  it('should keep the US and imperial gallons apart', () => {
    // They differ by 20%. A lab in the UK writing "gallon" means the imperial
    // one, and treating them as the same would be a silent 20% error.
    expect(convert(1, 'galUK', 'L')).toBeCloseTo(4.54609, 5);
    expect(convert(1, 'galUK', 'gal')).toBeCloseTo(1.2009499, 6);
  });

  it('should round-trip every unit through its base', () => {
    // Catches a factor written as its reciprocal, which is otherwise invisible:
    // the conversion still produces a number, just the wrong one.
    for (const [symbol, u] of Object.entries(UNITS)) {
      if (u.dim === 'temperature') continue;
      const base = DIMENSIONS[u.dim].base;
      expect(convert(convert(7, symbol, base), base, symbol), symbol).toBeCloseTo(7, 6);
    }
  });

  it('should refuse a conversion between two dimensions', () => {
    expect(() => convert(1, 'g', 'mL')).toThrow(/incompatibleUnits|different kinds/);
    expect(() => convert(1, 'min', 'm')).toThrow(/incompatibleUnits|different kinds/);
  });

  it('should refuse molarity against mass concentration', () => {
    // Both are "a concentration" to a user, and both appear in the picker, but
    // they are different dimensions: converting needs a molar mass this layer
    // has no way to know. This is the case that a single merged table got
    // wrong, so it is pinned here.
    expect(() => convert(1, 'M', 'g/L')).toThrow(/incompatibleUnits|different kinds/);
    expect(() => convert(1, 'mM', 'mg/mL')).toThrow(/incompatibleUnits|different kinds/);
  });

  it('should refuse an unknown unit', () => {
    expect(() => convert(1, 'g', 'furlong')).toThrow(/unknownUnit|Unknown unit/);
    expect(() => convert(1, 'blob', 'g')).toThrow(/unknownUnit|Unknown unit/);
  });

  it('should refuse a non-finite value', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(() => convert(bad, 'g', 'mg')).toThrow();
    }
  });

  it('should return the same value for the same unit', () => {
    for (const symbol of UNIT_SYMBOLS) {
      if (symbol in TEMPERATURE_UNITS) continue;
      expect(convert(3.5, symbol, symbol), symbol).toBeCloseTo(3.5, 9);
    }
  });
});

describe('temperature', () => {
  it('should convert with the offset, not just a factor', () => {
    // The bug this exists for: every other unit scales by multiplication, so
    // treating temperature the same way gives 0 °C = 0 K. It is off by 273.15
    // and looks like a plausible answer.
    expect(convert(0, 'C', 'K')).toBeCloseTo(273.15, 9);
    expect(convert(0, 'C', 'F')).toBeCloseTo(32, 9);
    expect(convert(100, 'C', 'F')).toBeCloseTo(212, 9);
    expect(convert(0, 'K', 'C')).toBeCloseTo(-273.15, 9);
  });

  it('should agree on the fixed points of each scale', () => {
    // -40 is the one temperature where Celsius and Fahrenheit are equal; it is
    // the standard check that an affine conversion is wired the right way round.
    expect(convert(-40, 'C', 'F')).toBeCloseTo(-40, 9);
    expect(convert(-40, 'F', 'C')).toBeCloseTo(-40, 9);
    expect(convert(0, 'K', 'R')).toBeCloseTo(0, 9);
    expect(convert(0, 'R', 'K')).toBeCloseTo(0, 9);
  });

  it('should round-trip every temperature scale', () => {
    for (const a of Object.keys(TEMPERATURE_UNITS)) {
      for (const b of Object.keys(TEMPERATURE_UNITS)) {
        expect(convert(convert(37, a, b), b, a), `${a} -> ${b}`).toBeCloseTo(37, 6);
      }
    }
  });
});

describe('exponent vectors', () => {
  it('should look up a unit or a dimension name', () => {
    expect(exponentsOf('g')).toEqual(EXPONENTS.mass);
    expect(exponentsOf('mass')).toEqual(EXPONENTS.mass);
    expect(exponentsOf('molarity')).toEqual(EXPONENTS.molarity);
  });

  it('should reject something that is neither', () => {
    expect(() => exponentsOf('furlong')).toThrow();
  });

  it('should name a vector the table knows', () => {
    expect(dimensionFromExponents(EXPONENTS.mass)).toBe('mass');
    expect(dimensionFromExponents(EXPONENTS.energy)).toBe('energy');
  });

  it('should return null for a vector the table does not name', () => {
    expect(dimensionFromExponents([9, 9, 9, 9, 9, 9])).toBeNull();
  });

  it('should compose a name for an unnamed vector rather than failing', () => {
    // A correct intermediate result must not be reported as an error merely
    // because it has no familiar name.
    expect(nameExponents([1, 2, 3, 0, 0, 0])).toBe('M·L2·T3');
    expect(nameExponents(EXPONENTS.mass)).toBe('mass');
  });

  it('should name a dimensionless vector as such', () => {
    expect(isDimensionless([0, 0, 0, 0, 0, 0])).toBe(true);
    expect(isDimensionless(EXPONENTS.mass)).toBe(false);
    expect(nameExponents([0, 0, 0, 0, 0, 0])).toBe('dimensionless');
  });
});

describe('dimensionOf', () => {
  it('should report the dimension of a unit', () => {
    expect(dimensionOf('g')).toBe('mass');
    expect(dimensionOf('M')).toBe('molarity');
    expect(dimensionOf('g/L')).toBe('massConcentration');
    expect(dimensionOf('C')).toBe('temperature');
  });

  it('should return null rather than throwing for a non-unit', () => {
    // Used to decide whether a token is a unit, where "no" is an ordinary
    // answer and an exception would be control flow.
    expect(dimensionOf('furlong')).toBeNull();
    expect(dimensionOf('')).toBeNull();
  });
});

describe('unitsOf', () => {
  it('should list only the units of the requested dimension', () => {
    for (const dim of Object.keys(DIMENSIONS)) {
      for (const u of unitsOf(dim)) {
        expect(dimensionOf(u), `${u} in ${dim}`).toBe(dim);
      }
    }
  });

  it('should cover every unit exactly once across all dimensions', () => {
    // Temperature lives in its own table because it converts affinely, so the
    // two together are the full set — and neither may repeat a symbol, which
    // would mean a unit is reachable under two dimensions.
    const all = Object.keys(DIMENSIONS).flatMap((d) => unitsOf(d));
    const expected = [...UNIT_SYMBOLS, ...Object.keys(TEMPERATURE_UNITS)];
    expect(all.sort()).toEqual(expected.sort());
    expect(new Set(all).size, 'a unit appears in two dimensions').toBe(all.length);
  });
});
