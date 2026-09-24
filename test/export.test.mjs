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
