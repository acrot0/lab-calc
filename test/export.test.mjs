import { describe, it, expect } from 'vitest';
import {
  toCsv,
  toMarkdown,
  exportFilename,
  escapeCsvField,
  downloadCsv,
  downloadMarkdown,
  UTF8_BOM,
  CSV_COLUMNS,
  toBundle,
  parseBundle,
  mergeEntries,
  BUNDLE_FORMAT,
  BUNDLE_VERSION,
  localStamp,
} from '../src/ui/export.mjs';

const entry = (over = {}) => ({
  id: 'a1',
  kind: 'stockFromSolid',
  at: '2026-09-24T10:00:00.000Z',
  summary: '称取 14.61 g NaCl，定容至 500 mL（0.5 mol/L）',
  inputs: { formula: 'NaCl', molarity: 0.5, volumeMl: 500 },
  outputs: { massG: 14.61, molarMass: 58.44 },
  ...over,
});

describe('escapeCsvField', () => {
  it('should leave a plain value alone', () => {
    expect(escapeCsvField('NaCl')).toBe('NaCl');
  });

  it('should quote a value containing a comma', () => {
    // An unquoted comma would split one field into two and shift every column.
    expect(escapeCsvField('14.61 g, NaCl')).toBe('"14.61 g, NaCl"');
  });

  it('should double internal quotes', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('should quote a value containing a newline', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('should render null and undefined as empty', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });

  it('should stringify numbers', () => {
    expect(escapeCsvField(14.61)).toBe('14.61');
  });
});

describe('toCsv', () => {
  it('should emit a header row', () => {
    const csv = toCsv([entry()]);
    expect(csv.split('\n')[0]).toBe(CSV_COLUMNS.join(','));
  });

  it('should emit one row per entry', () => {
    const csv = toCsv([entry(), entry({ id: 'a2' })]);
    expect(csv.trim().split('\n')).toHaveLength(3); // header + 2
  });

  it('should include the formula and the computed mass', () => {
    const csv = toCsv([entry()]);
    expect(csv).toContain('NaCl');
    expect(csv).toContain('14.61');
  });

  it('should quote a summary that contains a comma', () => {
    const csv = toCsv([entry({ summary: 'a, b' })]);
    expect(csv).toContain('"a, b"');
  });

  it('should produce a header-only file for an empty history', () => {
    // Not an empty string: a spreadsheet opening a zero-byte file shows an
    // error, while a header-only file opens cleanly and shows the columns.
    const csv = toCsv([]);
    expect(csv.trim()).toBe(CSV_COLUMNS.join(','));
  });

  it('should not throw on an entry with missing fields', () => {
    expect(() => toCsv([{ kind: 'x' }])).not.toThrow();
  });
});

describe('toMarkdown', () => {
  it('should produce a markdown table with a header separator', () => {
    const md = toMarkdown([entry()]);
    const lines = md.split('\n');
    expect(lines[0]).toContain('|');
    expect(lines[1]).toMatch(/^\|[\s:|-]+\|$/);
  });

  it('should include one row per entry', () => {
    const md = toMarkdown([entry(), entry({ id: 'a2' })]);
    expect(md.split('\n').filter((l) => l.startsWith('|')).length).toBe(4); // header + sep + 2
  });

  it('should escape a pipe so the table does not break', () => {
    // A raw | inside a cell silently adds a column and shifts everything.
    const md = toMarkdown([entry({ summary: 'a | b' })]);
    expect(md).toContain('a \\| b');
  });

  it('should produce a valid empty table for no entries', () => {
    const md = toMarkdown([]);
    expect(md.split('\n').length).toBeGreaterThanOrEqual(2);
  });
});

describe('exportFilename', () => {
  it('should stamp the date so exports do not collide', () => {
    const name = exportFilename('csv', new Date('2026-09-24T10:00:00Z'));
    expect(name).toBe('lab-calc-2026-09-24.csv');
  });

  it('should use the right extension per format', () => {
    const d = new Date('2026-09-24T10:00:00Z');
    expect(exportFilename('markdown', d)).toBe('lab-calc-2026-09-24.md');
  });

  it('should use a filesystem-safe name', () => {
    const name = exportFilename('csv', new Date('2026-09-24T10:00:00Z'));
    expect(name).toMatch(/^[a-z0-9.-]+$/);
  });
});

describe('UTF8_BOM', () => {
  it('should be the UTF-8 byte-order mark', () => {
    expect(UTF8_BOM.charCodeAt(0)).toBe(0xfeff);
  });

  it('should sit in front of the CSV header when prepended', () => {
    // Without this, Excel on Windows decodes the file as ANSI and every
    // Chinese character becomes mojibake — while the columns still line up,
    // so the corruption reads as bad data rather than a broken export.
    const withBom = UTF8_BOM + toCsv([entry()]);
    expect(withBom.charCodeAt(0)).toBe(0xfeff);
    expect(withBom.slice(1).startsWith('时间')).toBe(true);
  });
});

describe('download helpers', () => {
  it('should no-op without a DOM rather than throwing', () => {
    // These run in CI under Node, where document does not exist.
    expect(() => downloadCsv([entry()])).not.toThrow();
    expect(() => downloadMarkdown([entry()])).not.toThrow();
    expect(downloadCsv([entry()])).toBe(false);
  });
});

describe('toBundle', () => {
  it('should record the format and version from the first release', () => {
    // A format that gains a version only when it first breaks has already
    // shipped files that nobody can migrate.
    const b = JSON.parse(toBundle([entry()], new Date('2026-09-25T00:00:00Z')));
    expect(b.format).toBe(BUNDLE_FORMAT);
    expect(b.version).toBe(BUNDLE_VERSION);
    expect(b.exportedAt).toBe('2026-09-25T00:00:00.000Z');
  });

  it('should keep the records intact, unlike the CSV export', () => {
    // The whole point of the bundle: inputs survive so the calculation can be
    // replayed, which the flattened CSV cannot support.
    const b = JSON.parse(toBundle([entry()]));
    expect(b.entries[0].inputs).toEqual({ formula: 'NaCl', molarity: 0.5, volumeMl: 500 });
  });

  it('should round-trip through parseBundle unchanged', () => {
    const original = [entry(), entry({ id: 'b2', kind: 'dilution' })];
    const back = parseBundle(toBundle(original));
    expect(back.ok).toBe(true);
    expect(back.entries).toEqual(original);
  });
});

describe('parseBundle', () => {
  it('should reject a file that is not JSON', () => {
    expect(parseBundle('not json at all').code).toBe('notJson');
  });

  it('should reject JSON that is not a bundle', () => {
    expect(parseBundle('{"hello":"world"}').code).toBe('wrongFormat');
  });

  it('should reject a top-level array', () => {
    // An array is valid JSON and would otherwise reach the version check and
    // fail with a confusing message.
    expect(parseBundle('[1,2,3]').code).toBe('notBundle');
  });

  it('should reject a bundle from a newer version rather than importing part of it', () => {
    // Importing a subset would silently drop fields this build does not know,
    // and the next save would erase them from the stored copy.
    const b = JSON.stringify({ format: BUNDLE_FORMAT, version: BUNDLE_VERSION + 1, entries: [entry()] });
    expect(parseBundle(b).code).toBe('newerVersion');
  });

  it('should reject a missing or non-integer version', () => {
    const b = JSON.stringify({ format: BUNDLE_FORMAT, entries: [entry()] });
    expect(parseBundle(b).code).toBe('badVersion');
  });

  it('should drop unusable rows and report how many, not fail the whole file', () => {
    const b = JSON.stringify({
      format: BUNDLE_FORMAT,
      version: 1,
      entries: [entry(), null, { nope: true }, 'string', entry({ id: 'c3' })],
    });
    const r = parseBundle(b);
    expect(r.ok).toBe(true);
    expect(r.entries).toHaveLength(2);
    expect(r.dropped).toBe(3);
  });

  it('should accept an empty entry list as a valid import', () => {
    const b = JSON.stringify({ format: BUNDLE_FORMAT, version: 1, entries: [] });
    expect(parseBundle(b)).toMatchObject({ ok: true, entries: [], dropped: 0 });
  });
});

describe('mergeEntries', () => {
  it('should be idempotent when the same file is imported twice', () => {
    // Distinct timestamps so the assertion is about deduplication rather than
    // which way a tie happened to fall.
    const rows = [
      entry({ id: 'a1', at: '2026-09-24T10:00:00.000Z' }),
      entry({ id: 'b2', at: '2026-09-24T11:00:00.000Z' }),
    ];
    const once = mergeEntries([], rows);
    const twice = mergeEntries(once, rows);
    expect(twice.map((e) => e.id)).toEqual(['b2', 'a1']);
    expect(twice).toHaveLength(2);
  });

  it('should sort newest first regardless of which side an entry came from', () => {
    const older = entry({ id: 'old', at: '2026-01-01T00:00:00.000Z' });
    const newer = entry({ id: 'new', at: '2026-09-01T00:00:00.000Z' });
    expect(mergeEntries([older], [newer]).map((e) => e.id)).toEqual(['new', 'old']);
  });

  it('should keep existing entries when the incoming set is empty', () => {
    expect(mergeEntries([entry()], []).map((e) => e.id)).toEqual(['a1']);
  });

  it('should respect the cap so the merged list cannot exceed storage', () => {
    const many = Array.from({ length: 10 }, (_, i) => entry({ id: `x${i}` }));
    expect(mergeEntries([], many, 3)).toHaveLength(3);
  });

  it('should skip rows without an id rather than merging them under undefined', () => {
    // Without this, every id-less row would dedupe against the first one and
    // the import would silently lose all but one of them.
    const rows = [entry({ id: undefined }), entry({ id: undefined }), entry({ id: 'ok' })];
    expect(mergeEntries([], rows).map((e) => e.id)).toEqual(['ok']);
  });
});

describe('export labels and units', () => {
  it('should head the CSV with labels and units, not raw field keys', () => {
    // The defect this fixes: a CSV cell reading `massG=14.61`, which is the
    // key the code uses and not a word anyone reads.
    const csv = toCsv([entry()]);
    expect(csv).toContain('质量 (g)=14.61');
    expect(csv).toContain('摩尔质量 (g/mol)=58.44');
    expect(csv).not.toContain('massG=');
    expect(csv).not.toContain('molarMass=');
  });

  it('should write a readable local timestamp rather than raw ISO UTC', () => {
    // `2026-09-24T10:00:00.000Z` in a lab notebook column is noise; its reader
    // has to do the timezone arithmetic themselves.
    const csv = toCsv([entry()]);
    expect(csv).not.toContain('T10:00:00.000Z');
    expect(csv).toMatch(/2026[/-]09[/-]24/);
  });

  it('should leave an unparseable timestamp alone rather than print Invalid Date', () => {
    expect(toCsv([entry({ at: 'not a date' })])).toContain('not a date');
    expect(toCsv([entry({ at: null })])).not.toContain('Invalid');
  });

  it('should head the columns in the reader\'s language', () => {
    // The English export used to carry Chinese column headings.
    expect(toCsv([entry()], 'en').split('\n')[0]).toBe('Time,Type,Summary,Inputs,Results');
    expect(toCsv([entry()], 'zh').split('\n')[0]).toBe(CSV_COLUMNS.join(','));
  });

  it('should name the record kind in the reader\'s language', () => {
    // The Type column is the one that tells a reader what the row even is, so
    // an untranslated kind leaves an English export unreadable.
    expect(toCsv([entry()], 'en')).toContain('Weigh & prepare');
    expect(toCsv([entry()], 'zh')).toContain('称量配制');
  });

  it('should fall back to the stored key for an unknown kind', () => {
    // A record written by a newer version must still export, not vanish.
    expect(toCsv([entry({ kind: 'somethingNew' })])).toContain('somethingNew');
  });

  it('should label the markdown table the same way', () => {
    const md = toMarkdown([entry()], 'en');
    expect(md).toContain('| Time | Type | Summary | Inputs | Results |');
    expect(md).toContain('Mass (g)=14.61');
  });

  it('should put the unit in the header cell, never in the data cell', () => {
    // A value carrying its unit as text cannot be summed or plotted, which is
    // most of the reason to export a spreadsheet rather than a CSV. The unit
    // belongs to the label, and the number stays a number.
    const md = toMarkdown([entry()]);
    const results = md.split('\n').at(-1).split('|').at(-2).trim();
    expect(results).toContain('质量 (g)=14.61');
    // Scoped to the results cell: the summary is prose and may say "14.61 g"
    // in a sentence, which is correct there and is not what this asserts.
    expect(results).not.toContain('14.61 g');
  });
});

describe('localStamp', () => {
  it('should render an instant in the local zone, to the minute', () => {
    const s = localStamp('2026-09-24T10:00:00.000Z', 'zh');
    expect(s).toMatch(/2026[/-]09[/-]24 \d{2}:\d{2}/);
    expect(s).not.toContain('T');
    expect(s).not.toContain('Z');
  });

  it('should return empty for a missing value rather than the epoch', () => {
    expect(localStamp(null)).toBe('');
    expect(localStamp(undefined)).toBe('');
  });
});
