import { describe, it, expect } from 'vitest';
import { toXlsxNotes, toMarkdown } from '../src/ui/export.mjs';
import { DISCLAIMER_POINTS } from '../src/ui/disclaimer.mjs';

/**
 * The notes sheet's contents.
 *
 * `toMetaRows` already wrote the identifying facts — software, version,
 * exported-at, record count, time zone, which side each field came from, and
 * the one-line "for teaching only" disclaimer. What it did **not** carry is the
 * substantive part: which quantities the model corrects for and which it does
 * not.
 *
 * That omission matters more here than anywhere else in the app. A spreadsheet
 * is the artefact that leaves — it gets pasted into a report, mailed to a
 * supervisor, opened six months later by someone who never saw the app. The
 * README has a whole 「已校正的与未建模的」 section written on the principle that
 * calling a corrected quantity "ignored" is itself a false statement. The file
 * that travels without the app should not be the one place that distinction
 * goes missing.
 *
 * ## Why it reads DISCLAIMER_POINTS rather than repeating the text
 *
 * The app's own notice and the README's section say the same thing, and they
 * have already drifted apart once — the notice was written when only the buffer
 * tab corrected for activity, and became false the moment the pH tab did. A
 * third copy here would be a third thing to forget. The disclaimer module is
 * the one that is shown to every user on first run, so it is the copy that gets
 * corrected; this reads it.
 */
describe('toXlsxNotes', () => {
  const rows = toXlsxNotes('zh', 3);

  it('should carry the model-limits section', () => {
    const flat = rows.flat().join('\n');
    expect(flat).toContain('已校正');
    expect(flat).toContain('未建模');
  });

  it('should state the corrected and uncorrected cases from the notice, not a copy', () => {
    // The assertion is against the source of truth, so editing the notice
    // cannot leave the export claiming something the app no longer says.
    const limits = DISCLAIMER_POINTS.find((p) => p.titleEn === 'The model is simplified');
    expect(limits, 'the notice must still carry a model-limits point').toBeDefined();
    const flat = rows.flat().join('\n');
    expect(flat).toContain(limits.zh);
  });

  it('should carry the verify-it-yourself instruction', () => {
    const verify = DISCLAIMER_POINTS.find((p) => p.titleEn === 'Verify results yourself');
    expect(rows.flat().join('\n')).toContain(verify.zh);
  });

  it('should name the app and version so an orphaned file is identifiable', () => {
    const flat = rows.flat().join('\n');
    expect(flat).toContain('Lab Calc');
  });

  it('should say how many records it describes', () => {
    // A file found on its own has no other way to tell whether it is complete.
    expect(rows.flat().join('\n')).toContain('3');
  });

  it('should render in English when the export is English', () => {
    const en = toXlsxNotes('en', 1).flat().join('\n');
    expect(en).toContain('model is simplified');
    expect(en).not.toContain('已校正');
  });
});

/*
 * Every disclaimer point must reach the export.
 *
 * The notes sheet rendered two of the four points in `DISCLAIMER_POINTS` — the
 * model limits and the verify note — and dropped the teaching-only line and the
 * intended-use restriction. Measured on a real export, not assumed: the sheet
 * carried 「已校正的与未建模的」 and 「核对结果」 and nothing else.
 *
 * Then the ± landed on seven tabs and the export said nothing about it, which is
 * the worse half: a spreadsheet cell holds `14.61` and the uncertainty that says
 * the fourth digit is not real lives in a panel the file does not travel with.
 * Someone averaging a column six months later cannot know the numbers carry a ±
 * at all.
 *
 * Written as a sweep over `DISCLAIMER_POINTS` rather than as assertions on the
 * specific strings, so a fifth point added later fails this test until it is
 * rendered — which is the failure mode that produced both omissions.
 */
describe('every disclaimer point reaches the export', () => {
  const entries = [{
    id: '1', at: '2026-09-27T10:00:00Z', kind: 'stockFromSolid', summary: '称取 14.61 g NaCl',
    inputs: { formula: 'NaCl' }, outputs: { massG: 14.61 },
  }];

  it('should render every point in the xlsx notes sheet', () => {
    const flat = toXlsxNotes('zh', 1, {
      exported: '2026/09/27 10:00', inputKeys: ['formula'], outputKeys: ['massG'],
    }).flat().join(' | ');
    const missing = DISCLAIMER_POINTS
      .filter((p) => !flat.includes(p.titleZh))
      .map((p) => p.titleZh);
    expect(missing, `未进说明 sheet: ${missing.join('、')}`).toEqual([]);
  });

  it('should render every point in the Markdown footer', () => {
    const md = toMarkdown(entries, 'zh');
    const missing = DISCLAIMER_POINTS
      .filter((p) => !md.includes(p.titleZh))
      .map((p) => p.titleZh);
    expect(missing, `未进 Markdown: ${missing.join('、')}`).toEqual([]);
  });

  it('should render every point in English too', () => {
    // The English export is a different document, not a translation of the
    // Chinese one, and it reads the same array — so a point whose `titleEn` is
    // missing would render as `undefined` rather than failing.
    const md = toMarkdown(entries, 'en');
    const missing = DISCLAIMER_POINTS
      .filter((p) => !md.includes(p.titleEn))
      .map((p) => p.titleEn);
    expect(missing, `missing from English export: ${missing.join(', ')}`).toEqual([]);
  });

  it('should state that results carry an uncertainty', () => {
    // The specific omission that prompted this file. Asserted by content, not
    // by title, because a heading with no text under it would pass the sweep
    // above and tell the reader nothing.
    const md = toMarkdown(entries, 'zh');
    expect(md).toMatch(/±/);
    expect(md).toMatch(/ISO 1042/);
    expect(md).toMatch(/真实的不确定度通常比这个大/);
  });
});
