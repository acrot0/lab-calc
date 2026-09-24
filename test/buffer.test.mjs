import { describe, it, expect } from 'vitest';
import {
  hendersonHasselbalch,
  bufferRecipe,
  dilutionSeries,
  unitConvert,
  MASS_UNITS,
} from '../src/calc/buffer.mjs';

/**
 * Buffer chemistry rests on one equation, so the tests are written against
 * textbook cases with known answers rather than against the implementation.
 *
 *   pH = pKa + log10([A-] / [HA])
 */

describe('hendersonHasselbalch', () => {
  it('should return pKa when acid and base are equal', () => {
    // log10(1) = 0, so pH == pKa. This is the definition of the buffer midpoint.
    expect(hendersonHasselbalch({ pKa: 4.76, acidConc: 0.1, baseConc: 0.1 })).toBeCloseTo(4.76, 6);
  });

  it('should compute the acetate buffer at a 10:1 ratio', () => {
    // Acetic acid pKa 4.76; 0.1 M base / 0.01 M acid → pH = 4.76 + 1 = 5.76
    expect(hendersonHasselbalch({ pKa: 4.76, acidConc: 0.01, baseConc: 0.1 })).toBeCloseTo(5.76, 6);
  });

  it('should compute the 1:10 ratio, giving one pH unit below pKa', () => {
    expect(hendersonHasselbalch({ pKa: 4.76, acidConc: 0.1, baseConc: 0.01 })).toBeCloseTo(3.76, 6);
  });

  it('should reject a zero concentration rather than returning -Infinity', () => {
    // log10(0) is -Infinity. Returning that as a "pH" would be nonsense.
    expect(() => hendersonHasselbalch({ pKa: 4.76, acidConc: 0, baseConc: 0.1 })).toThrow();
    expect(() => hendersonHasselbalch({ pKa: 4.76, acidConc: 0.1, baseConc: 0 })).toThrow();
  });

  it('should reject a negative concentration', () => {
    expect(() => hendersonHasselbalch({ pKa: 4.76, acidConc: -1, baseConc: 0.1 })).toThrow();
  });

  it('should reject a missing pKa', () => {
    expect(() => hendersonHasselbalch({ acidConc: 0.1, baseConc: 0.1 })).toThrow();
  });
});

describe('bufferRecipe', () => {
  it('should solve the acid:base ratio needed for a target pH', () => {
    // target 5.76 from pKa 4.76 → ratio 10
    const r = bufferRecipe({ pKa: 4.76, targetPh: 5.76 });
    expect(r.ratio).toBeCloseTo(10, 4);
  });

  it('should return a ratio of 1 at the midpoint', () => {
    expect(bufferRecipe({ pKa: 4.76, targetPh: 4.76 }).ratio).toBeCloseTo(1, 6);
  });

  it('should split a total concentration between the two forms', () => {
    const r = bufferRecipe({ pKa: 4.76, targetPh: 4.76, totalConc: 0.2 });
    expect(r.acidConc).toBeCloseTo(0.1, 6);
    expect(r.baseConc).toBeCloseTo(0.1, 6);
  });

  it('should give more base than acid when the target is above pKa', () => {
    const r = bufferRecipe({ pKa: 4.76, targetPh: 5.76, totalConc: 0.2 });
    expect(r.baseConc).toBeGreaterThan(r.acidConc);
    expect(r.acidConc + r.baseConc).toBeCloseTo(0.2, 6);
  });

  it('should warn when the target is outside the useful buffering range', () => {
    // A buffer is only useful within roughly pKa ± 1. Outside that the ratio
    // is so lopsided it has almost no capacity — worth saying out loud.
    const far = bufferRecipe({ pKa: 4.76, targetPh: 7.5 });
    expect(far.inRange).toBe(false);
    const near = bufferRecipe({ pKa: 4.76, targetPh: 5.2 });
    expect(near.inRange).toBe(true);
  });
});

describe('dilutionSeries', () => {
  it('should produce a doubling series', () => {
    const s = dilutionSeries({ stockConc: 100, factor: 2, steps: 4 });
    expect(s.map((x) => x.conc)).toEqual([50, 25, 12.5, 6.25]);
  });

  it('should report the volume of stock and diluent for each step', () => {
    // Each step: take 1 part previous, add 1 part diluent → 50 mL stock + 50 mL
    const s = dilutionSeries({ stockConc: 100, factor: 2, steps: 1, stepVolumeMl: 100 });
    expect(s[0].stockVolumeMl).toBeCloseTo(50, 6);
    expect(s[0].diluentVolumeMl).toBeCloseTo(50, 6);
  });

  it('should produce a 10-fold series', () => {
    const s = dilutionSeries({ stockConc: 1000, factor: 10, steps: 3 });
    expect(s.map((x) => x.conc)).toEqual([100, 10, 1]);
  });

  it('should reject a factor of 1 or less, which would not dilute', () => {
    expect(() => dilutionSeries({ stockConc: 100, factor: 1, steps: 3 })).toThrow();
    expect(() => dilutionSeries({ stockConc: 100, factor: 0.5, steps: 3 })).toThrow();
  });

  it('should reject a non-positive step count', () => {
    expect(() => dilutionSeries({ stockConc: 100, factor: 2, steps: 0 })).toThrow();
    expect(() => dilutionSeries({ stockConc: 100, factor: 2, steps: -1 })).toThrow();
  });
});

describe('unitConvert', () => {
  it('should convert grams to milligrams', () => {
    expect(unitConvert(1, 'g', 'mg')).toBeCloseTo(1000, 6);
  });

  it('should convert milligrams to micrograms', () => {
    expect(unitConvert(1, 'mg', 'ug')).toBeCloseTo(1000, 6);
  });

  it('should round-trip through any unit pair', () => {
    for (const [a, b] of [['g', 'mg'], ['mg', 'ug'], ['g', 'ug'], ['kg', 'g']]) {
      expect(unitConvert(unitConvert(5, a, b), b, a)).toBeCloseTo(5, 6);
    }
  });

  it('should convert millilitres to microlitres', () => {
    expect(unitConvert(1, 'mL', 'uL')).toBeCloseTo(1000, 6);
  });

  it('should handle molarity prefixes', () => {
    expect(unitConvert(1, 'M', 'mM')).toBeCloseTo(1000, 6);
    expect(unitConvert(1, 'M', 'uM')).toBeCloseTo(1e6, 3);
  });

  it('should reject a unit it does not know, rather than assuming a factor', () => {
    expect(() => unitConvert(1, 'g', 'furlong')).toThrow(
      expect.objectContaining({ code: 'unknownUnit' }),
    );
  });

  it('should refuse to convert mass to volume', () => {
    // Both g and mL have a factor of 1 against their own base, so dividing one
    // by the other returned the input unchanged — a confident, meaningless
    // answer that nothing downstream could flag. Grams and millilitres are not
    // the same kind of quantity; relating them needs a density this function
    // has no way to know.
    expect(() => unitConvert(1, 'g', 'mL')).toThrow(
      expect.objectContaining({ code: 'incompatibleUnits' }),
    );
  });

  it('should reject every cross-dimension pair', () => {
    const cross = [
      ['g', 'mL'], ['g', 'L'], ['kg', 'uL'], ['mg', 'M'],
      ['mL', 'g'], ['L', 'mg'], ['uL', 'kg'], ['M', 'mL'],
      ['mM', 'g'], ['uM', 'L'],
    ];
    for (const [a, b] of cross) {
      expect(() => unitConvert(1, a, b), `${a} -> ${b}`).toThrow(
        expect.objectContaining({ code: 'incompatibleUnits' }),
      );
    }
  });

  it('should still convert within each dimension after the guard', () => {
    expect(unitConvert(2, 'kg', 'g')).toBeCloseTo(2000, 6);
    expect(unitConvert(2, 'L', 'mL')).toBeCloseTo(2000, 6);
    expect(unitConvert(2, 'mM', 'uM')).toBeCloseTo(2000, 6);
  });

  it('should report which dimensions collided, so the message can explain', () => {
    try {
      unitConvert(1, 'g', 'mL');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.params.fromDim).toBe('mass');
      expect(e.params.toDim).toBe('volume');
    }
  });

  it('should return the same value for identical units', () => {
    expect(unitConvert(3.5, 'mg', 'mg')).toBeCloseTo(3.5, 9);
  });

  it('should expose its unit tables for the UI to build a picker', () => {
    expect(Object.keys(MASS_UNITS).length).toBeGreaterThan(3);
  });
});
