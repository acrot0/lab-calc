import { describe, it, expect } from 'vitest';
import { xlsxPlan, XLSX_VIEWS } from '../src/ui/export.mjs';

/*
 * The layout half of the export, tested without a DOM.
 *
 * `downloadXlsx` cannot be tested here — it touches `document` and dynamically
 * imports the ZIP writer. The decision it makes is separable from the effect it
 * has, so it lives in `xlsxPlan` and that is what these tests pin.
 *
 * The numbers below are the ones the complaint is about. Measured through the
 * real `xlsxPlan` (`.tmp/diag/plan-measure.mjs`), a three-record history costs
 * 156 characters of total column width in the record view and 529 in the data
 * view, against roughly 240 visible on a 1920px screen. The assertion is
 * deliberately loose (240, not 156): it is the "fits a screen" property being
 * pinned, not a magic constant that would need editing every time a label gains
 * a character.
 */

/** The three kinds the diagnostic used, in the shape the app writes them. */
const entries = [
  {
    id: '1',
    at: '2026-09-27T01:00:00.000Z',
    kind: 'massForMolarity',
    summary: '称取 NaCl 14.61 g 配成 500 mL 0.5 mol/L',
    inputs: { 化学式: 'NaCl', '目标浓度 (mol/L)': '0.5', '定容体积 (mL)': '500' },
    outputs: { '摩尔质量 (g/mol)': 58.44, '应称取质量 (g)': 14.61 },
  },
  {
    id: '2',
    at: '2026-09-27T01:01:00.000Z',
    kind: 'bufferRecipe',
    summary: '配制 0.1 mol/L 磷酸缓冲液 pH 7.2，1 L',
    inputs: { 缓冲体系: '磷酸', '目标 pH': '7.2', '总浓度 (mol/L)': '0.1', '体积 (mL)': '1000' },
    outputs: { '酸型质量 (g)': 1.36, '碱型质量 (g)': 2.28, '离子强度 (mol/L)': 0.0583, 'pH (校正后)': 7.19 },
  },
  {
    id: '3',
    at: '2026-09-27T01:02:00.000Z',
    kind: 'uncertainty',
    summary: '不确定度合成：称量 + 定容',
    inputs: { '称量质量 (g)': '0.5000', '天平允差 (mg)': '0.1', '定容体积 (mL)': '100.00', '移液管允差 (mL)': '0.08' },
    outputs: { '合成标准不确定度': 0.00012, '相对扩展不确定度 (%)': 0.048, '包含因子 k': 2, '扩展不确定度 (mL)': 0.024 },
  },
];

/** What the sheet costs to display, in characters — CJK counts double. */
const CJK = /[ᄀ-ᅟ⺀-䶿가-힯豈-﫿︰-﹯＀-｠￠-￦]/;
const totalWidth = (widths) => widths.reduce((a, b) => a + b, 0);

/** A 1920px screen at the default spreadsheet font, with room to breathe. */
const SCREEN_CHARS = 240;

describe('xlsxPlan', () => {
  it('should offer exactly the two views the menu can name', () => {
    expect(XLSX_VIEWS).toEqual(['record', 'data']);
  });

  it('should default to the record view, which fits a screen', () => {
    const plan = xlsxPlan(entries, { now: new Date('2026-09-27T02:00:00Z') });
    expect(plan.view).toBe('record');
    expect(plan.rows[0]).toEqual(['时间', '类型', '说明', '输入', '结果']);
    expect(totalWidth(plan.widths)).toBeLessThanOrEqual(SCREEN_CHARS);
  });

  it('should fold every field into its cell in the record view', () => {
    const plan = xlsxPlan(entries, { view: 'record' });
    // One row per record plus the header — the count does not grow with the
    // number of distinct fields, which is the whole point of this view.
    expect(plan.rows).toHaveLength(entries.length + 1);
    expect(plan.rows[1][3]).toContain('化学式=NaCl');
    expect(plan.rows[1][4]).toContain('应称取质量 (g)=14.61');
  });

  it('should give every field its own column in the data view', () => {
    const plan = xlsxPlan(entries, { view: 'data' });
    // 3 fixed columns, then one per input and per output across the set.
    expect(plan.rows[0].length).toBeGreaterThan(10);
    expect(plan.rows[0].some((h) => h.includes('目标浓度'))).toBe(true);
  });

  it('should widen past a screen in the data view, which is why it is not the default', () => {
    const plan = xlsxPlan(entries, { view: 'data' });
    // Recorded rather than asserted as desirable: the data view exists for
    // machines, and a machine does not scroll.
    expect(totalWidth(plan.widths)).toBeGreaterThan(SCREEN_CHARS);
  });

  it('should keep only the requested fields in the data view', () => {
    const plan = xlsxPlan(entries, {
      view: 'data',
      columns: { inputs: ['化学式'], outputs: ['应称取质量 (g)'] },
    });
    expect(plan.rows[0]).toEqual([
      '时间', '类型', '说明',
      '化学式（输入）', '应称取质量 (g)（结果）',
    ]);
  });

  it('should name the sheet after the view', () => {
    expect(xlsxPlan(entries, { view: 'record' }).sheetName).toBe('记录');
    expect(xlsxPlan(entries, { view: 'data' }).sheetName).toBe('计算结果');
    expect(xlsxPlan(entries, { view: 'data', locale: 'en' }).sheetName).toBe('Results');
  });

  it('should carry the model limits into the notes in both views', () => {
    for (const view of XLSX_VIEWS) {
      const notes = xlsxPlan(entries, { view }).notes;
      const flat = notes.map((r) => r.join(' ')).join('\n');
      expect(flat).toContain('已校正的与未建模的');
      expect(flat).toContain('核对结果');
    }
  });

  it('should name the file after the view so the two do not collide', () => {
    const record = xlsxPlan(entries, { view: 'record', now: new Date('2026-09-27T02:00:00Z') });
    const data = xlsxPlan(entries, { view: 'data', now: new Date('2026-09-27T02:00:00Z') });
    expect(record.filename).not.toBe(data.filename);
    expect(record.filename.endsWith('.xlsx')).toBe(true);
  });

  it('should survive an empty history without producing a broken sheet', () => {
    const plan = xlsxPlan([], {});
    expect(plan.rows.length).toBeGreaterThanOrEqual(1);
    expect(plan.rows[0]).toEqual(['时间', '类型', '说明', '输入', '结果']);
  });

  it('should fall back to the record view for an unknown view name', () => {
    expect(xlsxPlan(entries, { view: 'nonsense' }).view).toBe('record');
  });
});
