import { describe, it, expect } from 'vitest';
import {
  procedureFor,
  proceduresFor,
  hasProcedure,
  proceduralKinds,
} from '../src/ui/procedure.mjs';

/** A weighing record as `WeighTab` actually writes it. */
const weigh = {
  kind: 'stockFromSolid',
  inputs: { formula: 'NaCl', molarity: 0.5, volumeMl: 500 },
  outputs: { massG: 14.61, molarMass: 58.44, moles: 0.25, finalVolumeMl: 500 },
  summary: '称取 14.61 g NaCl',
};

/** A dilution record as `DiluteTab` writes it. */
const dilute = {
  kind: 'dilution',
  inputs: { stockConc: 1, targetConc: 0.1, targetVolumeMl: 100 },
  outputs: { stockVolumeMl: 10, diluentVolumeMl: 90, foldDilution: 10 },
  summary: '取 10 mL 母液稀释至 100 mL',
};

/** A buffer record as `BufferTab` writes it. */
const buffer = {
  kind: 'bufferRecipe',
  inputs: { pKa: 4.76, targetPh: 5, totalConc: 0.1 },
  outputs: { ratio: 1.74, pKa: 4.76, targetPh: 5, inRange: true, acidConc: 0.0365, baseConc: 0.0635 },
  summary: 'pH 5 缓冲液',
};

/** A serial dilution record as `SeriesTab` writes it. */
const series = {
  kind: 'dilutionSeries',
  inputs: { stockConc: 1, factor: 10, steps: 5, stepVolumeMl: 100 },
  outputs: { series: [{ step: 1, conc: 0.1, stockVolumeMl: 10, diluentVolumeMl: 90, stepVolumeMl: 100 }] },
  summary: '5 步 10 倍梯度稀释',
};

describe('hasProcedure', () => {
  it('should be true for the four procedural kinds', () => {
    expect(hasProcedure('stockFromSolid')).toBe(true);
    expect(hasProcedure('dilution')).toBe(true);
    expect(hasProcedure('bufferRecipe')).toBe(true);
    expect(hasProcedure('dilutionSeries')).toBe(true);
  });

  it('should be false for a calculation that is not a procedure', () => {
    // A Nernst potential is arithmetic, not something a person does with their
    // hands. Inventing steps for it would be padding.
    expect(hasProcedure('nernst')).toBe(false);
    expect(hasProcedure('beerLambert')).toBe(false);
  });

  it('should be false for an unknown kind', () => {
    expect(hasProcedure('somethingElse')).toBe(false);
  });

  it('should not be fooled by an inherited property name', () => {
    expect(hasProcedure('toString')).toBe(false);
    expect(hasProcedure('constructor')).toBe(false);
  });
});

describe('proceduralKinds', () => {
  it('should list every procedural kind', () => {
    // `massForMolarity` is not a synonym for `stockFromSolid`: the weigh tab
    // records one or the other depending on which direction the user worked,
    // and both appear in `KIND_TO_TAB` and in the summaries table.
    expect(proceduralKinds().sort()).toEqual(
      ['bufferRecipe', 'dilution', 'dilutionSeries', 'massForMolarity', 'stockFromSolid'],
    );
  });

  it('should have a recipe for every kind the history can hold as a procedure', () => {
    // A kind that reaches the history but has no recipe would export without a
    // card, silently — the reader would never know one was possible.
    for (const kind of ['massForMolarity', 'stockFromSolid', 'dilution', 'dilutionSeries', 'bufferRecipe']) {
      expect(hasProcedure(kind)).toBe(true);
    }
  });
});

describe('procedureFor', () => {
  it('should return null for a kind with no recipe', () => {
    expect(procedureFor({ kind: 'nernst', inputs: {}, outputs: {} })).toBeNull();
  });

  it('should return null for a record with no kind', () => {
    expect(procedureFor({})).toBeNull();
    expect(procedureFor(null)).toBeNull();
  });

  it('should give the weighing recipe three steps', () => {
    const p = procedureFor(weigh, 'zh');
    expect(p.steps).toHaveLength(3);
  });

  it('should name the mass in the first weighing step', () => {
    const p = procedureFor(weigh, 'zh');
    expect(p.steps[0]).toContain('14.61');
    expect(p.steps[0]).toContain('g');
  });

  it('should name the flask volume in the second weighing step', () => {
    const p = procedureFor(weigh, 'zh');
    expect(p.steps[1]).toContain('500');
  });

  it('should name the formula in the weighing title', () => {
    const p = procedureFor(weigh, 'zh');
    expect(p.title).toContain('NaCl');
  });

  it('should name the stock volume in the dilution recipe', () => {
    const p = procedureFor(dilute, 'zh');
    expect(p.steps[0]).toContain('10');
  });

  it('should name the target volume in the dilution recipe', () => {
    const p = procedureFor(dilute, 'zh');
    expect(p.steps[1]).toContain('100');
  });

  it('should name both buffer components in the buffer recipe', () => {
    const p = procedureFor(buffer, 'zh');
    expect(p.steps[0]).toContain('0.0365');
    expect(p.steps[0]).toContain('0.0635');
  });

  it('should name the target pH in the buffer recipe', () => {
    const p = procedureFor(buffer, 'zh');
    // `fmt` trims trailing zeros, so pH 5 prints as "5" rather than "5.00" —
    // matching how the tab itself renders it.
    expect(p.steps[2]).toContain('5');
  });

  it('should name the per-step volume in the serial dilution recipe', () => {
    const p = procedureFor(series, 'zh');
    expect(p.steps[0]).toContain('100');
  });

  it('should name the step count and factor in the serial dilution title', () => {
    const p = procedureFor(series, 'zh');
    expect(p.title).toContain('5');
    expect(p.title).toContain('10');
  });

  it('should render in English when asked', () => {
    const zh = procedureFor(weigh, 'zh');
    const en = procedureFor(weigh, 'en');
    expect(en.steps[0]).not.toBe(zh.steps[0]);
    expect(en.steps[0]).toMatch(/weigh/i);
  });

  it('should keep the numbers identical across languages', () => {
    const zh = procedureFor(weigh, 'zh');
    const en = procedureFor(weigh, 'en');
    expect(en.steps[0]).toContain('14.61');
    expect(zh.steps[0]).toContain('14.61');
  });

  it('should default to Chinese', () => {
    expect(procedureFor(weigh).steps[0]).toBe(procedureFor(weigh, 'zh').steps[0]);
  });

  it('should never leave an unfilled placeholder in any step', () => {
    for (const rec of [weigh, dilute, buffer, series]) {
      for (const locale of ['zh', 'en']) {
        const p = procedureFor(rec, locale);
        for (const step of p.steps) {
          expect(step).not.toMatch(/\{|\}/);
        }
        expect(p.title).not.toMatch(/\{|\}/);
      }
    }
  });

  it('should drop a step whose number the record does not carry', () => {
    // A record from an older version may lack an output the step needs. A step
    // reading "Weigh out  of NaCl" is one a tired person follows, so it goes.
    const partial = { kind: 'stockFromSolid', inputs: { formula: 'NaCl', molarity: 0.5, volumeMl: 500 }, outputs: {} };
    const p = procedureFor(partial, 'zh');
    expect(p.steps).toHaveLength(2);
    for (const step of p.steps) expect(step).not.toMatch(/\{|\}/);
  });

  it('should return null when no step can be filled at all', () => {
    // A titled recipe with no steps is a promise the file does not keep.
    const empty = { kind: 'stockFromSolid', inputs: {}, outputs: {} };
    expect(procedureFor(empty, 'zh')).toBeNull();
  });

  it('should never emit a step containing an empty substitution', () => {
    const partial = { kind: 'dilution', inputs: { stockConc: 1 }, outputs: {} };
    const p = procedureFor(partial, 'zh');
    if (p) for (const s of p.steps) expect(s).not.toMatch(/ {2,}|\{\}/);
  });

  it('should use scientific notation for a volume too small to print', () => {
    // A serial dilution's transfer volume is routinely in the microlitre range,
    // and "transfer 0.00 mL" is worse than no recipe.
    const tiny = {
      kind: 'dilutionSeries',
      inputs: { stockConc: 1, factor: 1000, steps: 3, stepVolumeMl: 1 },
      outputs: { series: [{ stepVolumeMl: 1 }] },
    };
    const p = procedureFor(tiny, 'zh');
    expect(p.steps[0]).not.toContain('0.00 mL');
  });

  it('should survive a non-numeric input without throwing', () => {
    const bad = { kind: 'dilution', inputs: { stockConc: 'abc', targetConc: null }, outputs: {} };
    expect(() => procedureFor(bad, 'zh')).not.toThrow();
  });

  it('should survive a null input object', () => {
    expect(() => procedureFor({ kind: 'dilution' }, 'zh')).not.toThrow();
  });
});

describe('proceduresFor', () => {
  it('should return one procedure per procedural record', () => {
    expect(proceduresFor([weigh, dilute], 'zh')).toHaveLength(2);
  });

  it('should skip records that have no procedure', () => {
    const mixed = [weigh, { kind: 'nernst', inputs: {}, outputs: {} }, dilute];
    expect(proceduresFor(mixed, 'zh')).toHaveLength(2);
  });

  it('should carry the record summary so a card can be matched to its row', () => {
    const [first] = proceduresFor([weigh], 'zh');
    expect(first.summary).toBe(weigh.summary);
  });

  it('should preserve the order of the records', () => {
    const out = proceduresFor([dilute, weigh], 'zh');
    expect(out[0].summary).toBe(dilute.summary);
    expect(out[1].summary).toBe(weigh.summary);
  });

  it('should return an empty array for an empty or missing list', () => {
    expect(proceduresFor([], 'zh')).toEqual([]);
    expect(proceduresFor(null, 'zh')).toEqual([]);
    expect(proceduresFor(undefined, 'zh')).toEqual([]);
  });
});
