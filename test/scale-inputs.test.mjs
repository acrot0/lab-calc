import { describe, it, expect } from 'vitest';
import { scaleInputs, SCALE_FACTORS, scaleKind } from '../src/ui/scale-inputs.mjs';

/*
 * Batch scaling: take a saved preparation and re-make it at another size.
 *
 * The competitor survey found this in most of the tools that do preparation
 * work (Lab.Hacks, the hydroponics calculators, PCR master-mix tools, which
 * express it as "24 reactions × 1.1 = prepare for 27"). Lab Calc had no way to
 * do it: a record saved at 500 mL had to be re-typed field by field to get the
 * same recipe at 250 mL.
 *
 * The rule that makes it safe is the one thing these tests are mostly about:
 * **scale the amounts, never the concentrations.** Doubling a recipe doubles
 * the mass and the volume; the molarity is what stays the same, and scaling it
 * would silently turn a 0.5 M solution into a 1 M one that still looks like
 * the record it came from.
 */

describe('scaleInputs', () => {
  it('should scale a mass and a volume by the factor', () => {
    const out = scaleInputs({ formula: 'NaCl', molarity: 0.5, volumeMl: 500 }, 2);
    expect(out.volumeMl).toBe(1000);
    // The concentration is the target, not an amount. Doubling the batch does
    // not double the molarity.
    expect(out.molarity).toBe(0.5);
  });

  it('should leave a non-numeric field untouched', () => {
    const out = scaleInputs({ formula: 'NaCl', molarity: 0.5, volumeMl: 500 }, 0.5);
    expect(out.formula).toBe('NaCl');
    expect(out.volumeMl).toBe(250);
  });

  it('should not mutate the input', () => {
    const inputs = { formula: 'NaCl', molarity: 0.5, volumeMl: 500 };
    scaleInputs(inputs, 2);
    expect(inputs.volumeMl).toBe(500);
  });

  it('should scale every amount in a multi-component recipe', () => {
    // A buffer or a master mix has several amounts and they must all move
    // together — scaling two of three produces a recipe that is wrong in a way
    // no single field shows.
    const out = scaleInputs({ aMl: 10, bMl: 5, cMl: 2.5, volumeMl: 100 }, 4);
    expect(out).toMatchObject({ aMl: 40, bMl: 20, cMl: 10, volumeMl: 400 });
  });

  it('should keep integer-valued fields integral when the result is whole', () => {
    // 0.25 × 500 is exactly 125. Floating point makes it 125.00000000000001,
    // which would then be re-parsed and re-displayed as that.
    const out = scaleInputs({ volumeMl: 500 }, 0.25);
    expect(out.volumeMl).toBe(125);
  });

  it('should not produce floating-point noise', () => {
    // 0.1 × 3 in binary is 0.30000000000000004.
    const out = scaleInputs({ volumeMl: 0.1 }, 3);
    expect(String(out.volumeMl)).toBe('0.3');
  });

  it('should round a scaled amount to a sane number of decimals', () => {
    // 0.333 × 1000 mL = 333; but 0.1 × 1/3 must not carry 15 digits.
    const out = scaleInputs({ volumeMl: 0.1 }, 1 / 3);
    expect(String(out.volumeMl).length).toBeLessThan(10);
  });

  it('should reject a non-positive factor', () => {
    // A zero or negative factor produces amounts that are zero or nonsense.
    // Failing loudly beats writing a record that looks real.
    expect(() => scaleInputs({ volumeMl: 500 }, 0)).toThrow();
    expect(() => scaleInputs({ volumeMl: 500 }, -2)).toThrow();
  });

  it('should reject a non-finite factor', () => {
    expect(() => scaleInputs({ volumeMl: 500 }, NaN)).toThrow();
    expect(() => scaleInputs({ volumeMl: 500 }, Infinity)).toThrow();
  });

  it('should throw a CalcError with a code, not a bare Error', () => {
    // The calc layer's contract: an error carries a code the UI translates.
    // A bare Error would reach the user as an English stack message.
    try {
      scaleInputs({ volumeMl: 500 }, 0);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e.code).toBeTruthy();
    }
  });

  it('should leave a field that is not a finite number alone', () => {
    // Blank and half-typed fields are normal in a saved record.
    const out = scaleInputs({ volumeMl: '', note: 'x', n: null }, 2);
    expect(out.volumeMl).toBe('');
    expect(out.note).toBe('x');
    expect(out.n).toBeNull();
  });
});

describe('SCALE_FACTORS', () => {
  it('should offer only factors that make sense for a bench', () => {
    expect([...SCALE_FACTORS]).toEqual([0.25, 0.5, 2, 5, 10]);
  });

  it('should contain no factor that is zero or negative', () => {
    for (const f of SCALE_FACTORS) expect(f).toBeGreaterThan(0);
  });
});

describe('scaleKind', () => {
  it('should scale the four procedural kinds', () => {
    // These are the ones a person makes with their hands, and the ones
    // procedure.mjs already writes steps for.
    for (const k of ['stockFromSolid', 'dilution', 'bufferRecipe', 'dilutionSeries']) {
      expect(scaleKind(k), k).toBe(true);
    }
  });

  it('should not scale a kind that is not a preparation', () => {
    // A Nernst potential is a property of a cell, not a batch of something.
    // Offering "×2" on it would invite a meaningless record.
    expect(scaleKind('nernst')).toBe(false);
    expect(scaleKind('michaelisMenten')).toBe(false);
  });

  it('should refuse an unknown kind rather than guess', () => {
    expect(scaleKind('somethingNew')).toBe(false);
    expect(scaleKind(null)).toBe(false);
  });
});

describe('scaling a real record end to end', () => {
  /*
   * The property that matters to a user: a scaled record makes the same
   * solution, only more or less of it.
   *
   * Asserting on `scaleInputs` alone would not catch a concentration that got
   * scaled — the object would look fine and the calculation would be wrong.
   * These run the scaled inputs through the real calculator and check the
   * answer, which is the only place the mistake would show.
   */
  it('should double the mass and keep the concentration when doubling a batch', async () => {
    const { stockFromSolid } = await import('../src/calc/solution.mjs');
    const original = { formula: 'NaCl', molarity: 0.5, volumeMl: 500 };
    const before = stockFromSolid(original);
    const after = stockFromSolid(scaleInputs(original, 2));

    expect(after.massG).toBeCloseTo(before.massG * 2, 6);
    expect(after.finalVolumeMl).toBe(1000);
    // The molarity is unchanged by construction — this is the assertion that
    // would fail if `molarity` had been scaled along with the amounts.
    expect(after.moles).toBeCloseTo(before.moles * 2, 6);
  });

  it('should halve the stock volume and keep the fold when halving a dilution', async () => {
    const { dilution } = await import('../src/calc/solution.mjs');
    const original = { stockConc: 1, targetConc: 0.1, targetVolumeMl: 500 };
    const before = dilution(original);
    const after = dilution(scaleInputs(original, 0.5));

    expect(after.stockVolumeMl).toBeCloseTo(before.stockVolumeMl / 2, 6);
    expect(after.foldDilution).toBe(before.foldDilution);
    // `targetConc` must not have moved: halving a dilution halves the volume,
    // it does not halve the concentration.
    expect(after.foldDilution).toBe(10);
  });

  it('should keep a tenfold batch exactly tenfold', async () => {
    const { stockFromSolid } = await import('../src/calc/solution.mjs');
    const original = { formula: 'NaCl', molarity: 0.5, volumeMl: 500 };
    const after = stockFromSolid(scaleInputs(original, 10));
    expect(after.finalVolumeMl).toBe(5000);
    expect(after.massG).toBeCloseTo(146.1, 6);
  });
});

describe('recompute', () => {
  /*
   * Scaling has to produce a finished record without mounting a tab, so the
   * kind has to map back to the calculator that made it. Nothing did that
   * before — each tab imports its own — so the mapping is new surface and gets
   * its own tests.
   */
  it('should re-run each scalable kind', async () => {
    const { recompute, SCALABLE_KINDS } = await import('../src/ui/scale-inputs.mjs');
    const inputs = {
      stockFromSolid: { formula: 'NaCl', molarity: 0.5, volumeMl: 500 },
      massForMolarity: { formula: 'NaCl', molarity: 0.5, volumeMl: 500 },
      dilution: { stockConc: 1, targetConc: 0.1, targetVolumeMl: 500 },
      bufferRecipe: { pKa: 4.76, targetPh: 5, totalConc: 0.1 },
      dilutionSeries: { stockConc: 1, factor: 10, steps: 4, stepVolumeMl: 100 },
    };
    for (const kind of SCALABLE_KINDS) {
      expect(inputs[kind], `no fixture for ${kind}`).toBeTruthy();
      expect(recompute(kind, inputs[kind]), kind).not.toBeNull();
    }
  });

  it('should cover exactly the kinds that have procedures', async () => {
    // The two registries must not drift: a kind with bench steps but no
    // calculator would offer a scale button that produces nothing.
    const { SCALABLE_KINDS } = await import('../src/ui/scale-inputs.mjs');
    const { proceduralKinds } = await import('../src/ui/procedure.mjs');
    expect([...SCALABLE_KINDS].sort()).toEqual([...proceduralKinds()].sort());
  });

  it('should return null for a kind with no calculator', async () => {
    const { recompute, calculatorFor } = await import('../src/ui/scale-inputs.mjs');
    expect(calculatorFor('nernst')).toBeNull();
    expect(recompute('nernst', {})).toBeNull();
  });

  it('should give a scaled record outputs, not just inputs', async () => {
    // A record with inputs but no outputs renders no summary and cannot be
    // replayed. The whole point of recomputing is to produce both.
    const { scaleInputs, recompute } = await import('../src/ui/scale-inputs.mjs');
    const original = { formula: 'NaCl', molarity: 0.5, volumeMl: 500 };
    const out = recompute('stockFromSolid', scaleInputs(original, 2));
    expect(out.massG).toBeCloseTo(29.22, 2);
    expect(out.finalVolumeMl).toBe(1000);
  });
});
