import { describe, it, expect } from 'vitest';
import { toMarkdown, toCsv } from '../src/ui/export.mjs';
import { DISCLAIMER_POINTS } from '../src/ui/disclaimer.mjs';

/*
 * The Markdown export is the one that gets pasted into a lab notebook, so it is
 * the one where a bare table is least defensible: a table of numbers with no
 * statement of what the model does and does not correct for is the artefact
 * that ends up in someone's report under a heading it does not support.
 *
 * The xlsx has a notes sheet for this. Markdown has prose, which is better.
 * CSV has neither, and is left alone — see the note on `toCsv` in the source.
 */

const entries = [
  {
    id: 'a1',
    kind: 'phCalc',
    at: '2026-09-27T01:00:00.000Z',
    summary: '计算 0.1 mol/L 醋酸 pH',
    inputs: { formula: 'CH3COOH', molarity: 0.1 },
    outputs: { ph: 2.87 },
  },
];

describe('toMarkdown notes', () => {
  it('should keep the table first, so the data is still the point', () => {
    const md = toMarkdown(entries);
    const firstLine = md.split('\n')[0];
    expect(firstLine.startsWith('|')).toBe(true);
  });

  it('should state what the model corrects for and what it does not', () => {
    const md = toMarkdown(entries);
    expect(md).toContain('已校正的与未建模的');
  });

  it('should take that text from DISCLAIMER_POINTS rather than restating it', () => {
    const md = toMarkdown(entries);
    const point = DISCLAIMER_POINTS.find((p) => p.titleEn === 'The model is simplified');
    // The body is copied, not paraphrased — a second wording is a second thing
    // to forget when the first is corrected.
    expect(md).toContain(point.zh);
  });

  it('should tell the reader to check the result themselves', () => {
    const md = toMarkdown(entries);
    expect(md).toContain('核对结果');
  });

  it('should record which software and version wrote the file', () => {
    const md = toMarkdown(entries);
    expect(md).toContain('Lab Calc');
    expect(md).toContain('记录条数');
  });

  it('should write the notes in English for an English export', () => {
    const md = toMarkdown(entries, 'en');
    expect(md).toContain('Corrected and not modelled');
    expect(md).not.toContain('已校正的与未建模的');
  });

  it('should not repeat the notes on every row', () => {
    const md = toMarkdown(entries);
    // Once, at the end — a footer, not a column.
    const hits = md.split('已校正的与未建模的').length - 1;
    expect(hits).toBe(1);
  });

  it('should still produce a usable document for an empty history', () => {
    const md = toMarkdown([]);
    expect(md).toContain('|');
    expect(md).toContain('已校正的与未建模的');
  });
});

describe('toCsv stays clean', () => {
  it('should keep the header on the first line, with no comment rows', () => {
    // The deliberate asymmetry with Markdown. A CSV's entire value is being
    // machine-readable, and its entire weakness is having nowhere to put
    // metadata. Comment rows paper over the weakness by spending the strength:
    // every strict RFC 4180 reader and every `read_csv` default then sees the
    // notes as data rows, and the file that was going to be parsed is not.
    const csv = toCsv(entries);
    expect(csv.split('\n')[0]).toBe('时间,类型,说明,输入,结果');
    expect(csv).not.toContain('已校正的与未建模的');
  });
});
