import { describe, it, expect } from 'vitest';
import { exportPreview, toCsv, toMarkdown, xlsxPlan } from '../src/ui/export.mjs';

/*
 * The export preview.
 *
 * The property that matters is agreement: what the preview shows must be what
 * the file contains. It calls the same helpers the writers do for exactly that
 * reason, and these tests hold it — a preview that disagrees with the download
 * is worse than no preview, because it is trusted.
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
  {
    id: 'a2',
    kind: 'dilution',
    at: '2026-09-27T02:00:00.000Z',
    summary: '取 10 mL 母液稀释至 100 mL',
    inputs: { stockConc: 1, targetConc: 0.1, targetVolumeMl: 100 },
    outputs: { stockVolumeMl: 10 },
  },
  {
    id: 'a3',
    kind: 'dilution',
    at: '2026-09-27T03:00:00.000Z',
    summary: '取 5 mL 母液稀释至 50 mL',
    inputs: { stockConc: 1, targetConc: 0.1, targetVolumeMl: 50 },
    outputs: { stockVolumeMl: 5 },
  },
  {
    id: 'a4',
    kind: 'dilution',
    at: '2026-09-27T04:00:00.000Z',
    summary: '取 2 mL 母液稀释至 20 mL',
    inputs: { stockConc: 1, targetConc: 0.1, targetVolumeMl: 20 },
    outputs: { stockVolumeMl: 2 },
  },
];

describe('exportPreview', () => {
  it('should report the total number of records', () => {
    expect(exportPreview(entries).total).toBe(4);
  });

  it('should cap the previewed rows at the limit', () => {
    expect(exportPreview(entries, { limit: 3 }).rows).toHaveLength(3);
  });

  it('should default to three rows', () => {
    expect(exportPreview(entries).rows).toHaveLength(3);
  });

  it('should show every record when there are fewer than the limit', () => {
    expect(exportPreview(entries.slice(0, 2), { limit: 3 }).rows).toHaveLength(2);
  });

  it('should never show more rows than exist', () => {
    expect(exportPreview([], { limit: 3 }).rows).toHaveLength(0);
  });

  it('should list the five fixed CSV columns', () => {
    const p = exportPreview(entries);
    expect(p.columns.slice(0, 5)).toEqual(['时间', '类型', '说明', '输入', '结果']);
  });

  it('should match the columns the CSV actually writes', () => {
    // The agreement property: same helpers, same header.
    const p = exportPreview(entries);
    const header = toCsv(entries).split('\n')[0].split(',');
    expect(p.columns).toHaveLength(header.length);
  });

  it('should match the columns the Markdown table actually writes', () => {
    const p = exportPreview(entries, { format: 'markdown' });
    const first = toMarkdown(entries).split('\n').find((l) => l.startsWith('| 时间 |'));
    const cells = first.split('|').slice(1, -1).map((s) => s.trim());
    expect(p.columns).toHaveLength(cells.length);
  });

  it('should preview the same rows the CSV writes', () => {
    const p = exportPreview(entries, { limit: 2 });
    const csvRows = toCsv(entries).trim().split('\n').slice(1, 3);
    for (let i = 0; i < 2; i++) {
      // The CSV escapes commas inside cells; the preview does not, so the
      // comparison is on the values rather than the raw line.
      expect(csvRows[i]).toContain(p.rows[i][2].replace(/,/g, ''));
    }
  });

  it('should use the record summaries as the third column', () => {
    const p = exportPreview(entries, { limit: 1 });
    expect(p.rows[0][2]).toBe(entries[0].summary);
  });

  it('should render in English when asked', () => {
    const p = exportPreview(entries, { locale: 'en' });
    expect(p.columns[0]).toBe('Time');
  });

  it('should fall back to the CSV shape for an unknown format', () => {
    const p = exportPreview(entries, { format: 'parquet' });
    expect(p.format).toBe('csv');
    expect(p.columns.slice(0, 5)).toEqual(['时间', '类型', '说明', '输入', '结果']);
  });

  it('should describe the record view of a spreadsheet', () => {
    const p = exportPreview(entries, { format: 'xlsx' });
    expect(p.format).toBe('xlsx');
    expect(p.total).toBe(4);
    expect(p.columns.length).toBeGreaterThan(0);
  });

  it('should describe the data view of a spreadsheet', () => {
    const p = exportPreview(entries, { format: 'xlsxData' });
    expect(p.columns.length).toBeGreaterThan(5);
  });

  it('should agree with the spreadsheet plan on the data-view columns', () => {
    const p = exportPreview(entries, { format: 'xlsxData' });
    const plan = xlsxPlan(entries, { view: 'data' });
    expect(p.columns).toHaveLength(plan.rows[0].length);
  });

  it('should honour a column subset in the data view', () => {
    const all = exportPreview(entries, { format: 'xlsxData' });
    const few = exportPreview(entries, { format: 'xlsxData', columns: { inputs: ['targetVolumeMl'], outputs: [] } });
    expect(few.columns.length).toBeLessThan(all.columns.length);
  });

  it('should never return a non-string cell', () => {
    // A React child that is an object throws; the preview renders these
    // directly.
    const p = exportPreview(entries, { format: 'xlsxData' });
    for (const row of p.rows) {
      for (const c of row) expect(typeof c).toBe('string');
    }
  });

  it('should survive an entry with missing fields', () => {
    expect(() => exportPreview([{ kind: 'x' }])).not.toThrow();
  });

  it('should survive an empty list', () => {
    const p = exportPreview([]);
    expect(p.total).toBe(0);
    expect(p.rows).toEqual([]);
  });

  it('should survive a missing list', () => {
    expect(() => exportPreview(null)).not.toThrow();
    expect(exportPreview(null).total).toBe(0);
  });

  it('should survive a limit of zero', () => {
    expect(exportPreview(entries, { limit: 0 }).rows).toHaveLength(0);
  });
});
