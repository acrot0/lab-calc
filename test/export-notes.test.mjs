import { describe, it, expect } from 'vitest';
import { toXlsxNotes } from '../src/ui/export.mjs';
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
