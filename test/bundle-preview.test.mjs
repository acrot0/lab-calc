import { describe, it, expect } from 'vitest';
import { bundlePreview, formatBytes, toBundle, parseBundle, BUNDLE_FORMAT } from '../src/ui/export.mjs';

/*
 * The JSON backup's confirmation.
 *
 * ## Why it is not the table preview
 *
 * Every other export is previewed as a table: its first few rows, the columns,
 * the count. That works because those files are row-shaped. The bundle is not —
 * it is the whole archive, deleted records included, and its purpose is being
 * complete. Three rows of a complete archive misread as "this file is small",
 * which is the opposite of the thing a user about to trust it with their data
 * needs to believe.
 *
 * But no confirmation at all was the other extreme, and for the worst possible
 * file: the bundle is the only export that can restore a history. So it gets a
 * different shape — counts and a size, no rows — and these tests hold the parts
 * that matter.
 *
 * ## The property that makes a preview worth having
 *
 * It must not disagree with the file. That is why the size here is measured
 * from the bytes `toBundle` actually produces rather than estimated from a
 * per-record average, and why the counts come from the same array the writer
 * is handed. A confirmation that is trusted and wrong is worse than none.
 */

const live = (n) => Array.from({ length: n }, (_, i) => ({
  id: `L${i}`, kind: 'weigh', at: '2026-09-29T00:00:00.000Z',
}));
const dead = (n) => Array.from({ length: n }, (_, i) => ({
  id: `D${i}`, kind: 'weigh', at: '2026-09-01T00:00:00.000Z', deletedAt: '2026-09-20T00:00:00.000Z',
}));

describe('what the bundle confirmation reports', () => {
  it('should count live and deleted records separately', () => {
    // The distinction is the whole point of the bundle: "export, clear,
    // re-import" has to bring back what was deleted, so a user has to be able
    // to see that the deleted ones are in there.
    const p = bundlePreview([...live(7), ...dead(3)]);
    expect(p.total).toBe(10);
    expect(p.live).toBe(7);
    expect(p.deleted).toBe(3);
  });

  it('should report the size of the file it will actually write', () => {
    /*
     * Measured, not estimated. A per-record average would drift as records
     * change shape — a record with ten inputs is not the same size as one with
     * two — and the number a user reads before deciding to keep a file has to
     * be the number they get.
     */
    const entries = [...live(50), ...dead(10)];
    const p = bundlePreview(entries, new Date('2026-09-29T12:00:00Z'));
    const actual = new TextEncoder().encode(toBundle(entries, new Date('2026-09-29T12:00:00Z'))).length;
    expect(p.bytes).toBe(actual);
  });

  it('should name the file the download will carry', () => {
    // The confirmation is the last point before a file is written; a reader
    // about to save it should know what it will be called.
    const p = bundlePreview(live(1), new Date('2026-09-29T00:00:00Z'));
    expect(p.filename).toBe('lab-calc-2026-09-29.json');
  });

  it('should handle an empty history without lying about it', () => {
    const p = bundlePreview([]);
    expect(p.total).toBe(0);
    expect(p.bytes).toBeGreaterThan(0); // the envelope is still written
  });

  it('should handle a missing list rather than throwing', () => {
    expect(() => bundlePreview(undefined)).not.toThrow();
    expect(bundlePreview(undefined).total).toBe(0);
  });

  it('should count a record with no deletedAt as live, including a zero or empty value', () => {
    // `deletedAt: ''` is what an older hand-written bundle can produce, and it
    // means "not deleted" — testing the field for truthiness rather than
    // presence is the difference.
    const p = bundlePreview([{ id: 'a', kind: 'weigh', at: '2026-09-29T00:00:00.000Z', deletedAt: '' }]);
    expect(p.live).toBe(1);
    expect(p.deleted).toBe(0);
  });
});

describe('the size a person reads', () => {
  it('should use binary units, matching what a file manager shows', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });

  it('should drop the decimal where it stops carrying information', () => {
    // `972.4 MB` is noise; `9.7 MB` is not. One digit below a hundred units.
    expect(formatBytes(9.7 * 1024 * 1024)).toBe('9.7 MB');
    expect(formatBytes(972 * 1024 * 1024)).toBe('972 MB');
  });

  it('should show whole bytes, because a fraction of one is not a thing', () => {
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(999.7)).toBe('1000 B');
  });

  it('should return nothing for a value that is not a size', () => {
    // The caller renders this into a sentence; `NaN MB` would be worse than the
    // sentence simply omitting the size.
    expect(formatBytes(NaN)).toBe('');
    expect(formatBytes(-1)).toBe('');
    expect(formatBytes(undefined)).toBe('');
    expect(formatBytes('not a number')).toBe('');
  });

  it('should stop at GB rather than inventing a unit', () => {
    expect(formatBytes(1024 ** 4)).toBe('1024 GB');
  });
});

describe('the confirmation agrees with the file', () => {
  it('should round-trip through the format it describes', () => {
    /*
     * The reason the bundle is worth a confirmation at all: it is the file a
     * user restores from. If the confirmation said "10 records" and the parse
     * gave back 9, the number would be worse than absent.
     */
    const entries = [...live(4), ...dead(2)];
    const p = bundlePreview(entries, new Date('2026-09-29T00:00:00Z'));
    const parsed = parseBundle(toBundle(entries, new Date('2026-09-29T00:00:00Z')));
    expect(parsed.ok).toBe(true);
    expect(parsed.entries).toHaveLength(p.total);
    expect(parsed.entries.filter((e) => e.deletedAt)).toHaveLength(p.deleted);
  });

  it('should describe the same format the writer stamps into the file', () => {
    const parsed = JSON.parse(toBundle(live(1)));
    expect(parsed.format).toBe(BUNDLE_FORMAT);
    expect(bundlePreview(live(1)).format).toBe('json');
  });
});
