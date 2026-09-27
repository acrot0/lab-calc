import { describe, it, expect } from 'vitest';
import { toMarkdown } from '../src/ui/export.mjs';

/*
 * The recipe cards in the Markdown export.
 *
 * The table is data; a person who has to make the solution needs the
 * operations in order. These tests hold the two properties that make the cards
 * safe to hand to someone at a bench: every number is present, and no card is
 * emitted for a calculation that has no procedure.
 */

const weigh = {
  id: 'w1',
  kind: 'stockFromSolid',
  at: '2026-09-28T01:00:00.000Z',
  summary: '称取 14.61 g NaCl，定容至 500 mL',
  inputs: { formula: 'NaCl', molarity: 0.5, volumeMl: 500 },
  outputs: { massG: 14.61, molarMass: 58.44, moles: 0.25, finalVolumeMl: 500 },
};

const dilute = {
  id: 'd1',
  kind: 'dilution',
  at: '2026-09-28T01:01:00.000Z',
  summary: '取 10 mL 母液稀释至 100 mL',
  inputs: { stockConc: 1, targetConc: 0.1, targetVolumeMl: 100 },
  outputs: { stockVolumeMl: 10, diluentVolumeMl: 90, foldDilution: 10 },
};

const nernst = {
  id: 'n1',
  kind: 'nernst',
  at: '2026-09-28T01:02:00.000Z',
  summary: 'E = 1.1037 V',
  inputs: { e0: 1.1037, n: 2 },
  outputs: { e: 1.1037 },
};

/** The recipe section only, so assertions cannot match the table above it. */
function recipes(md) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l === '## 配制步骤' || l === '## Preparation steps');
  if (start < 0) return '';
  const end = lines.findIndex((l, i) => i > start && l.startsWith('---'));
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

describe('recipe cards in the Markdown export', () => {
  it('should emit a recipe section when a record has a procedure', () => {
    expect(recipes(toMarkdown([weigh]))).toContain('配制步骤');
  });

  it('should emit no recipe section when no record has a procedure', () => {
    expect(recipes(toMarkdown([nernst]))).toBe('');
  });

  it('should not print an empty heading for a set with no procedures', () => {
    // An empty section is worse than no section: it reads as a failure.
    expect(toMarkdown([nernst])).not.toContain('## 配制步骤');
  });

  it('should name the mass to weigh', () => {
    expect(recipes(toMarkdown([weigh]))).toContain('14.61 g');
  });

  it('should name the flask volume', () => {
    expect(recipes(toMarkdown([weigh]))).toContain('500 mL');
  });

  it('should name the stock volume in a dilution card', () => {
    expect(recipes(toMarkdown([dilute]))).toContain('10 mL');
  });

  it('should number the steps from one', () => {
    const r = recipes(toMarkdown([weigh]));
    expect(r).toContain('1. ');
    expect(r).toContain('2. ');
    expect(r).toContain('3. ');
    expect(r).not.toContain('0. ');
  });

  it('should link each card to its table row by summary', () => {
    // Three weighing records produce three near-identical cards; the summary is
    // what tells the reader which one is theirs.
    const r = recipes(toMarkdown([weigh]));
    expect(r).toContain(weigh.summary);
  });

  it('should give each record its own card', () => {
    const r = recipes(toMarkdown([weigh, dilute]));
    expect(r).toContain('NaCl');
    expect(r).toContain('母液');
  });

  it('should keep the cards in the order of the records', () => {
    const r = recipes(toMarkdown([dilute, weigh]));
    expect(r.indexOf('母液')).toBeLessThan(r.indexOf('NaCl'));
  });

  it('should skip non-procedural records inside a mixed set', () => {
    const r = recipes(toMarkdown([weigh, nernst, dilute]));
    expect(r).toContain('NaCl');
    expect(r).toContain('母液');
    // The Nernst record's summary is not a card heading.
    expect(r).not.toContain('E = 1.1037 V');
  });

  it('should place the cards after the table', () => {
    const md = toMarkdown([weigh]);
    expect(md.indexOf('| 时间 |')).toBeLessThan(md.indexOf('## 配制步骤'));
  });

  it('should place the cards before the disclaimer footer', () => {
    // The footer is about the whole document; a card is about one record.
    const md = toMarkdown([weigh]);
    expect(md.indexOf('## 配制步骤')).toBeLessThan(md.indexOf('已校正的与未建模的'));
  });

  it('should render in English when asked', () => {
    const r = recipes(toMarkdown([weigh], 'en'));
    expect(r).toContain('Preparation steps');
    expect(r).toMatch(/Weigh out/);
  });

  it('should keep the numbers identical across languages', () => {
    expect(recipes(toMarkdown([weigh], 'en'))).toContain('14.61 g');
    expect(recipes(toMarkdown([weigh], 'zh'))).toContain('14.61 g');
  });

  it('should never emit an unfilled placeholder', () => {
    const md = toMarkdown([weigh, dilute]);
    expect(md).not.toMatch(/\{[a-z]+\}/i);
  });

  it('should produce a usable document for an empty history', () => {
    const md = toMarkdown([]);
    expect(md).toContain('|');
    expect(md).not.toContain('## 配制步骤');
  });

  it('should not break the table when a recipe is present', () => {
    const md = toMarkdown([weigh]);
    const tableLines = md.split('\n').filter((l) => l.startsWith('|'));
    expect(tableLines.length).toBeGreaterThanOrEqual(3);
    for (const line of tableLines) expect(line.endsWith('|')).toBe(true);
  });
});

describe('toCsv is unchanged by recipes', () => {
  it('should not carry recipe steps into the CSV', async () => {
    // The CSV's value is being parsed; a recipe card in it would be a row of
    // prose in the middle of the data.
    const { toCsv } = await import('../src/ui/export.mjs');
    const csv = toCsv([weigh]);
    expect(csv).not.toContain('容量瓶');
    expect(csv.split('\n')[0]).toBe('时间,类型,说明,输入,结果');
  });
});
