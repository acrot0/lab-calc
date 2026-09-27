import { describe, it, expect } from 'vitest';
import { toCsv, toMarkdown, xlsxPlan } from '../src/ui/export.mjs';
import { META_FIELDS } from '../src/ui/history.mjs';

/*
 * The user's metadata must reach the export.
 *
 * 「导出格式不够丰富，而且不支持自定义」 — the annotation feature is only worth
 * having if the annotation leaves with the file. A record tagged
 * `EXP-2026-14` that exports without it is a record whose tag exists only
 * inside the app, which is the opposite of what a lab record is for.
 *
 * The columns are appended rather than inserted, and only when at least one
 * record actually carries that field. Two reasons: an empty column is a claim
 * that something was measured and came out blank, and every existing user's
 * spreadsheet gains three columns of nothing if they are always written.
 */

const annotated = (over = {}) => ({
  id: 'a1',
  kind: 'bufferRecipe',
  at: '2026-09-27T02:00:00.000Z',
  summary: '配制磷酸缓冲液',
  inputs: { pKa: 7.2 },
  outputs: { acidConc: 0.0584 },
  meta: { experiment: 'EXP-2026-14', purpose: '毕业论文第三章' },
  ...over,
});

const plain = (over = {}) => ({
  id: 'a2',
  kind: 'dilution',
  at: '2026-09-27T02:01:00.000Z',
  summary: '稀释',
  inputs: { stockConc: 1 },
  outputs: { stockVolumeMl: 5 },
  ...over,
});

describe('metadata columns', () => {
  it('should write only the fields that are actually used', () => {
    // `operator` is not set on either record, so it must not become a column.
    const csv = toCsv([annotated(), plain()]);
    expect(csv).toContain('实验号');
    expect(csv).toContain('用途');
    expect(csv).not.toContain('操作人');
  });

  it('should add no columns at all when nothing is annotated', () => {
    // Every existing user's export must be byte-identical to before.
    const csv = toCsv([plain(), plain({ id: 'a3' })]);
    for (const f of META_FIELDS) {
      expect(csv, `${f.key} column appeared`).not.toContain(f.label.zh);
    }
  });

  it('should leave the cell empty for a record without that field', () => {
    const csv = toCsv([annotated(), plain()]);
    const lines = csv.trim().split('\n');
    const header = lines[0].split(',');
    const idx = header.indexOf('实验号');
    expect(idx).toBeGreaterThan(-1);
    // The un-annotated row has the column and nothing in it.
    const row = lines[2].split(',');
    expect(row[idx]).toBe('');
  });

  it('should escape a value containing a comma', () => {
    // Purposes are prose and will contain commas.
    const csv = toCsv([annotated({ meta: { purpose: '标定, 复测' } })]);
    expect(csv).toContain('"标定, 复测"');
  });

  it('should label the columns in the reader language', () => {
    const csv = toCsv([annotated()], 'en');
    expect(csv).toContain('Experiment');
    expect(csv).not.toContain('实验号');
  });

  it('should carry the metadata into the markdown table too', () => {
    const md = toMarkdown([annotated()]);
    expect(md).toContain('实验号');
    expect(md).toContain('EXP-2026-14');
  });

  it('should carry the metadata into the record view of the workbook', () => {
    const plan = xlsxPlan([annotated()]);
    expect(plan.rows[0]).toContain('实验号');
    const flat = plan.rows.map((r) => r.join(' ')).join('\n');
    expect(flat).toContain('EXP-2026-14');
  });

  it('should carry the metadata into the data view of the workbook', () => {
    const plan = xlsxPlan([annotated()], { view: 'data' });
    expect(plan.rows[0]).toContain('实验号');
  });

  it('should not put metadata into the inputs, which are replayed', () => {
    // An experiment number is not a concentration; feeding it back into a tab
    // would be a bug the replay path could not detect.
    const plan = xlsxPlan([annotated()], { view: 'data' });
    const header = plan.rows[0];
    // The input columns carry the (输入) suffix; the metadata ones do not.
    const metaIdx = header.indexOf('实验号');
    expect(header[metaIdx]).not.toContain('输入');
  });
});
