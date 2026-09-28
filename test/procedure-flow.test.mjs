import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  flowLayout,
  FLOW,
  STEP_KINDS,
  TEXT_BUDGET,
  TEXT_LEFT,
  textWidth,
  truncate,
} from '../src/ui/procedure-flow.mjs';
import { procedureFor, proceduralKinds } from '../src/ui/procedure.mjs';

/** Where the tab components live, resolved from this file. */
const TAB_DIR = path.resolve(import.meta.dirname, '../src/ui/tabs');

/*
 * The bench procedure drawn as a flow.
 *
 * `procedure.mjs` already turns a record into numbered steps — "weigh out
 * 14.61 g of NaCl", "transfer to a 500 mL flask", "make up to the mark". They
 * appear in the Markdown and the printed report as text, and nowhere on screen.
 *
 * What a drawing adds is the thing a numbered list cannot say: that step 2
 * depends on step 1, that the order is not a suggestion, and where the volumes
 * come together. That is the claim, and these tests are about the geometry
 * that carries it — a box in the wrong column or a connector that skips a step
 * states a procedure that is not the one the record holds.
 *
 * The layout is pure so it can be tested without a DOM: `flowLayout` takes the
 * steps and returns boxes and connectors in viewBox coordinates.
 */

describe('flowLayout', () => {
  const steps = ['称取 14.61 g NaCl', '转移至 500 mL 容量瓶', '加去离子水至刻度，摇匀'];

  it('should lay out one box per step', () => {
    const { boxes } = flowLayout(steps);
    expect(boxes).toHaveLength(3);
  });

  it('should number the boxes in order', () => {
    const { boxes } = flowLayout(steps);
    expect(boxes.map((b) => b.index)).toEqual([0, 1, 2]);
  });

  it('should stack the boxes down the figure, in order', () => {
    // Order is carried by position. If box 3 sat above box 1 the drawing would
    // state a different procedure from the list it came from.
    const { boxes } = flowLayout(steps);
    for (let i = 1; i < boxes.length; i += 1) {
      expect(boxes[i].y, `box ${i} is not below box ${i - 1}`).toBeGreaterThan(boxes[i - 1].y);
    }
  });

  it('should connect each box to the next, and only the next', () => {
    // n boxes have n-1 connectors. A missing one breaks the chain; an extra
    // one draws a shortcut the procedure does not have.
    const { connectors } = flowLayout(steps);
    expect(connectors).toHaveLength(steps.length - 1);
    for (let i = 0; i < connectors.length; i += 1) {
      expect(connectors[i].from).toBe(i);
      expect(connectors[i].to).toBe(i + 1);
    }
  });

  it('should keep every box inside the figure', () => {
    // A box drawn past the viewBox is invisible, and a procedure missing its
    // last step is one someone follows to the wrong place.
    const { boxes } = flowLayout(steps);
    for (const b of boxes) {
      expect(b.x, `box ${b.index} starts left of the figure`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w, `box ${b.index} runs past the right edge`).toBeLessThanOrEqual(FLOW.w);
      expect(b.y, `box ${b.index} starts above the figure`).toBeGreaterThanOrEqual(0);
      expect(b.y + b.h, `box ${b.index} runs past the bottom`).toBeLessThanOrEqual(FLOW.h);
    }
  });

  it('should not overlap two boxes', () => {
    const { boxes } = flowLayout(steps);
    for (let i = 1; i < boxes.length; i += 1) {
      expect(boxes[i].y, `box ${i} overlaps box ${i - 1}`).toBeGreaterThanOrEqual(boxes[i - 1].y + boxes[i - 1].h);
    }
  });

  it('should fit the tallest procedure the app can produce', () => {
    // A serial dilution's recipe is the longest at five steps. A layout that
    // only fits three would clip the one case where a diagram helps most.
    const five = ['a', 'b', 'c', 'd', 'e'];
    const { boxes } = flowLayout(five);
    const last = boxes[boxes.length - 1];
    expect(last.y + last.h).toBeLessThanOrEqual(FLOW.h);
  });

  it('should leave the figure label clear', () => {
    // The label sits on the last line of the viewBox. A five-step chain that
    // runs into it prints the label over the last box.
    const { boxes } = flowLayout(['a', 'b', 'c', 'd', 'e']);
    const last = boxes[boxes.length - 1];
    expect(last.y + last.h).toBeLessThan(FLOW.h - 12);
  });

  it('should centre the column vertically', () => {
    // Anchored at the top, a three-step chain leaves 108 units of empty figure
    // under it, which reads as a fourth step that failed to draw.
    const { boxes } = flowLayout(steps);
    const above = boxes[0].y;
    const below = FLOW.h - 22 - (boxes[boxes.length - 1].y + boxes[boxes.length - 1].h);
    expect(above).toBeCloseTo(below, 6);
  });

  it('should give a short procedure the same box size as a long one', () => {
    // Consistent boxes are what make two figures look like one set. Sizing a
    // box to its text makes a three-word step look like a different kind of
    // thing from a ten-word one.
    const one = flowLayout(['称取 14.61 g NaCl']).boxes[0];
    const many = flowLayout(steps).boxes[0];
    expect(one.w).toBe(many.w);
    expect(one.h).toBe(many.h);
  });

  it('should drop a procedure too long for the figure', () => {
    // Every recipe in the app is three steps and the figure holds five. An
    // imported record can carry more, and a chain drawn past the edge is a
    // procedure that silently stops early — worse than no figure.
    const { boxes } = flowLayout(Array.from({ length: 9 }, (_, i) => `s${i}`));
    expect(boxes).toEqual([]);
  });

  it('should return nothing for no steps', () => {
    const { boxes, connectors } = flowLayout([]);
    expect(boxes).toEqual([]);
    expect(connectors).toEqual([]);
  });

  it('should centre the column', () => {
    const { boxes } = flowLayout(steps);
    const centre = boxes[0].x + boxes[0].w / 2;
    expect(centre).toBeCloseTo(FLOW.w / 2, 6);
  });
});

describe('truncate', () => {
  it('should leave a step that fits untouched', () => {
    expect(truncate('称取 14.61 g NaCl')).toBe('称取 14.61 g NaCl');
  });

  it('should mark a step it cuts', () => {
    // A step that stops without a mark reads as a complete sentence, and the
    // reader follows half an instruction.
    const out = truncate('称取'.repeat(80));
    expect(out.endsWith('…')).toBe(true);
    expect(textWidth(out)).toBeLessThanOrEqual(TEXT_BUDGET);
  });

  it('should count CJK as two, matching how it renders', () => {
    expect(textWidth('中文')).toBe(4);
    expect(textWidth('ab')).toBe(2);
  });

  it('should fit the budget to the box', () => {
    /*
     * The budget and the box are the same fact. A budget that does not follow
     * the box silently truncates the longest step the moment the box narrows.
     *
     * 5.5px is the average advance of the face at the 11px the steps render at,
     * so the budget has to leave room for the number column beside it.
     */
    const { boxes } = flowLayout(['x']);
    expect(TEXT_BUDGET * 5.5 + TEXT_LEFT).toBeLessThanOrEqual(boxes[0].w);
  });
});

describe('the steps the app actually writes', () => {
  /*
   * The guard that matters: every step of every recipe, in both languages,
   * must fit the box without being cut. The truncation path exists for
   * imported records; it must never fire on text this app wrote itself, or
   * the one step a reader most needs in full is the one that gets an ellipsis.
   */
  const records = {
    massForMolarity: {
      kind: 'massForMolarity',
      inputs: { formula: 'NaCl', molarity: 0.5, volumeMl: 500 },
      outputs: { massG: 14.61 },
    },
    stockFromSolid: {
      kind: 'stockFromSolid',
      inputs: { formula: 'NaCl', molarity: 0.5, volumeMl: 500 },
      outputs: { massG: 14.61 },
    },
    dilution: {
      kind: 'dilution',
      inputs: { stockConc: 1, targetConc: 0.1, targetVolumeMl: 100 },
      outputs: { stockVolumeMl: 10, diluentVolumeMl: 90, foldDilution: 10 },
    },
    bufferRecipe: {
      kind: 'bufferRecipe',
      inputs: { pKa: 4.76, targetPh: 5, totalConc: 0.1 },
      outputs: { acidConc: 0.0365, baseConc: 0.0635, ratio: 1.74 },
    },
    dilutionSeries: {
      kind: 'dilutionSeries',
      inputs: { stockConc: 1, factor: 10, steps: 5, stepVolumeMl: 100 },
      outputs: { series: [{ step: 1, conc: 0.1, stockVolumeMl: 10, diluentVolumeMl: 90 }] },
    },
  };

  it('should cover every procedural kind', () => {
    // A kind with a recipe and no sample here would go unchecked.
    expect(Object.keys(records).sort()).toEqual(proceduralKinds().sort());
  });

  it('should fit every step of every recipe in both languages', () => {
    for (const kind of proceduralKinds()) {
      for (const locale of ['zh', 'en']) {
        const { steps } = procedureFor(records[kind], locale);
        for (const step of steps) {
          expect(
            textWidth(step),
            `${kind}/${locale} step overflows the box: ${step}`,
          ).toBeLessThanOrEqual(TEXT_BUDGET);
        }
      }
    }
  });

  it('should not cut any step of any recipe', () => {
    for (const kind of proceduralKinds()) {
      for (const locale of ['zh', 'en']) {
        const { steps } = procedureFor(records[kind], locale);
        for (const step of steps) {
          expect(truncate(step), `${kind}/${locale} step was cut: ${step}`).toBe(step);
        }
      }
    }
  });
});

describe('every procedural tab offers the flow', () => {
  /*
   * The failure this guards against already happened once: the figure was built
   * for the buffer tab and the other three procedural tabs shipped without it,
   * so a user on the weighing tab had no way to know the app could draw steps
   * at all. A feature that exists on one of four tabs is not a feature.
   *
   * Checked by reading the tab source rather than by rendering, because the
   * figure only appears after a calculation and a render test would have to
   * fill in every tab's fields to reach it.
   */
  const TABS = [
    ['stockFromSolid', 'WeighTab'],
    ['dilution', 'DiluteTab'],
    ['bufferRecipe', 'BufferTab'],
    ['dilutionSeries', 'SeriesTab'],
  ];

  it('should render ProcedureFlow in the tab that owns each procedural kind', () => {
    for (const [kind, tab] of TABS) {
      const src = fs.readFileSync(path.resolve(TAB_DIR, `${tab}.jsx`), 'utf8');
      expect(src, `${tab} does not render the procedure flow`).toContain('ProcedureFlow');
      expect(src, `${tab} renders it for the wrong kind`).toContain(`kind="${kind}"`);
    }
  });

  it('should account for every procedural kind', () => {
    /*
     * `massForMolarity` is a legacy kind: no tab writes it, it only arrives by
     * replaying an old record, and the steps it produces are the ones
     * `stockFromSolid` produces. So the four tabs above cover all five kinds,
     * and this asserts that rather than assuming it.
     */
    const covered = new Set(TABS.map(([kind]) => kind).concat('massForMolarity'));
    expect([...proceduralKinds()].sort()).toEqual([...covered].sort());
  });

  it('should not leave a hand-rolled flow behind in a tab', () => {
    // The shared component is the point: a tab that builds its own steps can
    // disagree with the export. ProcedureDiagram is only for the component.
    for (const [, tab] of TABS) {
      const src = fs.readFileSync(path.resolve(TAB_DIR, `${tab}.jsx`), 'utf8');
      expect(src, `${tab} draws the diagram directly`).not.toContain('ProcedureDiagram');
      expect(src, `${tab} derives steps itself`).not.toContain('procedureFor(');
    }
  });
});

describe('STEP_KINDS', () => {
  /*
   * The kinds are grouped into a *small* set of roles, and that is the point:
   * the accent answers "what sort of action is this" — measure something,
   * move it into a vessel, adjust a condition. Eight distinct accents would be
   * a legend the reader has to learn; three are readable without one.
   *
   * My first version of this test asserted the opposite — that every kind has
   * its own role — and failed against the design it was written for. The
   * assertion was wrong, not the code.
   */
  const ROLES = ['amount', 'vessel', 'condition'];

  it('should use only the declared roles', () => {
    for (const [kind, role] of Object.entries(STEP_KINDS)) {
      expect(ROLES, `${kind} has role "${role}"`).toContain(role);
    }
  });

  it('should group the kinds rather than giving each its own role', () => {
    const roles = Object.values(STEP_KINDS);
    expect(new Set(roles).size).toBeLessThan(roles.length);
  });

  it('should classify a weighing step as an amount', () => {
    // The one role that must be right: a weighing step is where the balance
    // reading goes, and it is what a reader scans the figure for.
    expect(STEP_KINDS.weigh).toBe('amount');
  });
});
