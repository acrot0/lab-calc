import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  crc32, zip, concat, escapeXml, columnName, sheetXml, workbookParts, toXlsx,
} from '../src/ui/xlsx.mjs';

/*
 * An .xlsx that is subtly malformed opens as "the file is corrupt" with no
 * indication of which part is wrong, so every assertion here reads the archive
 * back rather than trusting the bytes that were written.
 *
 * `unzip` is used where available because it validates the CRC and the
 * central-directory offsets — the two things that are easy to get wrong and
 * impossible to see by eye. Where it is not available the test still checks the
 * structure directly, so this suite does not silently pass on a machine without
 * it.
 */

/** Write bytes to a temp file and return the path. */
function tempFile(bytes, ext) {
  const p = path.join(os.tmpdir(), `lab-calc-test-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  fs.writeFileSync(p, Buffer.from(bytes));
  return p;
}

const hasUnzip = (() => {
  try {
    execFileSync('unzip', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('crc32', () => {
  it('should match the known CRC of an empty buffer', () => {
    // The defined value for the empty string, and the easiest case to get
    // wrong by initialising the accumulator to 0 instead of 0xffffffff.
    expect(crc32(new Uint8Array([]))).toBe(0);
  });

  it('should match the known CRC of "123456789"', () => {
    // The standard check value for CRC-32/ISO-HDLC.
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('should differ for different input', () => {
    const a = crc32(new TextEncoder().encode('sheet1'));
    const b = crc32(new TextEncoder().encode('sheet2'));
    expect(a).not.toBe(b);
  });
});

describe('columnName', () => {
  it('should name the first 26 columns A to Z', () => {
    expect(columnName(0)).toBe('A');
    expect(columnName(25)).toBe('Z');
  });

  it('should roll over to two letters at 27', () => {
    // The off-by-one here is the classic bug: 26 is AA, not BA.
    expect(columnName(26)).toBe('AA');
    expect(columnName(27)).toBe('AB');
  });

  it('should handle the third letter', () => {
    expect(columnName(702)).toBe('AAA');
  });
});

describe('escapeXml', () => {
  it('should escape the five predefined entities', () => {
    expect(escapeXml('a & b < c > d " e \' f'))
      .toBe('a &amp; b &lt; c &gt; d &quot; e &apos; f');
  });

  it('should strip control characters XML cannot represent', () => {
    // These cannot be escaped — a literal 0x01 makes the file unparseable and
    // Excel reports only "we found a problem with some content".
    expect(escapeXml('a\u0001b\u0008c')).toBe('abc');
  });

  it('should keep tab and newline, which XML does allow', () => {
    expect(escapeXml('a\tb\nc')).toBe('a\tb\nc');
  });

  it('should turn null and undefined into an empty string', () => {
    expect(escapeXml(null)).toBe('');
    expect(escapeXml(undefined)).toBe('');
  });
});

describe('sheetXml', () => {
  it('should write numbers as numbers, not text', () => {
    // A cell holding the string "0.5" looks the same and cannot be summed,
    // which is most of the reason to export a spreadsheet at all.
    const xml = sheetXml([[0.5, 3]]);
    expect(xml).toContain('<c r="A1"><v>0.5</v></c>');
    expect(xml).toContain('<c r="B1"><v>3</v></c>');
  });

  it('should write strings as inline strings', () => {
    expect(sheetXml([['NaCl']])).toContain('t="inlineStr"');
  });

  it('should leave a numeric-looking string as text', () => {
    // A zero-padded id or a formula name must not be reinterpreted.
    const xml = sheetXml([['007']]);
    expect(xml).toContain('t="inlineStr"');
    expect(xml).not.toContain('<v>007</v>');
  });

  it('should skip empty cells rather than writing empty ones', () => {
    const xml = sheetXml([['', 'b']]);
    expect(xml).not.toContain('r="A1"');
    expect(xml).toContain('r="B1"');
  });

  it('should emit column widths when given', () => {
    const xml = sheetXml([[1]], [12, 30]);
    expect(xml).toContain('width="12"');
    expect(xml).toContain('width="30"');
  });

  it('should preserve leading and trailing spaces', () => {
    // Without xml:space="preserve" a reader trims them.
    expect(sheetXml([[' a ']])).toContain('xml:space="preserve"');
  });

  it('should not write NaN or Infinity as a number', () => {
    // `<v>NaN</v>` is invalid; Excel rejects the whole file rather than the cell.
    const xml = sheetXml([[NaN, Infinity]]);
    expect(xml).not.toContain('<v>NaN</v>');
    expect(xml).not.toContain('<v>Infinity</v>');
  });
});

describe('zip', () => {
  const files = [
    { name: 'a.txt', data: new TextEncoder().encode('hello') },
    { name: 'dir/b.txt', data: new TextEncoder().encode('world') },
  ];

  it('should start with the local file header signature', () => {
    const bytes = zip(files);
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it('should end with the end-of-central-directory signature', () => {
    const bytes = zip(files);
    expect([...bytes.slice(-22, -18)]).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });

  it('should record the entry count in the central directory', () => {
    const bytes = zip(files);
    // The count is at offset 10 of the 22-byte EOCD record.
    const eocd = bytes.length - 22;
    expect(bytes[eocd + 10] | (bytes[eocd + 11] << 8)).toBe(2);
  });

  it('should be readable by unzip, which validates the CRC and offsets', () => {
    if (!hasUnzip) return; // Structure is checked above on machines without it.
    const file = tempFile(zip(files), 'zip');
    try {
      const list = execFileSync('unzip', ['-l', file], { encoding: 'utf8' });
      expect(list).toContain('a.txt');
      expect(list).toContain('dir/b.txt');
      // -t runs the CRC check on every entry.
      const test = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
      expect(test).toContain('No errors detected');
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('should round-trip the entry contents', () => {
    if (!hasUnzip) return;
    const file = tempFile(zip(files), 'zip');
    const out = path.join(os.tmpdir(), `lab-calc-unzip-${Date.now()}`);
    try {
      execFileSync('unzip', ['-o', '-q', file, '-d', out]);
      expect(fs.readFileSync(path.join(out, 'a.txt'), 'utf8')).toBe('hello');
      expect(fs.readFileSync(path.join(out, 'dir', 'b.txt'), 'utf8')).toBe('world');
    } finally {
      fs.unlinkSync(file);
      fs.rmSync(out, { recursive: true, force: true });
    }
  });
});

describe('workbookParts', () => {
  it('should emit the five parts Excel requires', () => {
    const names = workbookParts([[1]]).map((p) => p.name);
    expect(names).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/worksheets/sheet1.xml',
    ]);
  });

  it('should escape the sheet name', () => {
    // A sheet name comes from a constant today, but an unescaped & in one
    // breaks the workbook part and Excel refuses the file.
    const parts = workbookParts([[1]], { sheetName: 'A & B' });
    const wb = new TextDecoder().decode(parts.find((p) => p.name === 'xl/workbook.xml').data);
    expect(wb).toContain('A &amp; B');
  });

  it('should declare every part in the content types', () => {
    const ct = new TextDecoder().decode(
      workbookParts([[1]]).find((p) => p.name === '[Content_Types].xml').data,
    );
    expect(ct).toContain('/xl/workbook.xml');
    expect(ct).toContain('/xl/worksheets/sheet1.xml');
  });
});

describe('toXlsx', () => {
  const rows = [
    ['时间', '类型', '数值'],
    ['2026-09-25', '称量配制', 5.844],
    ['2026-09-25', '稀释 & 混合', 0.5],
  ];

  it('should produce a readable archive containing every part', () => {
    if (!hasUnzip) return;
    const file = tempFile(toXlsx(rows, { widths: [14, 12, 10] }), 'xlsx');
    try {
      const list = execFileSync('unzip', ['-l', file], { encoding: 'utf8' });
      for (const name of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']) {
        expect(list, `${name} missing from the archive`).toContain(name);
      }
      const test = execFileSync('unzip', ['-t', file], { encoding: 'utf8' });
      expect(test).toContain('No errors detected');
    } finally {
      fs.unlinkSync(file);
    }
  });

  it('should survive a round trip through the archive intact', () => {
    if (!hasUnzip) return;
    const file = tempFile(toXlsx(rows), 'xlsx');
    const out = path.join(os.tmpdir(), `lab-calc-xlsx-${Date.now()}`);
    try {
      execFileSync('unzip', ['-o', '-q', file, '-d', out]);
      const sheet = fs.readFileSync(path.join(out, 'xl', 'worksheets', 'sheet1.xml'), 'utf8');
      expect(sheet).toContain('称量配制');
      // The ampersand must arrive escaped, not raw.
      expect(sheet).toContain('稀释 &amp; 混合');
      expect(sheet).not.toContain('稀释 & 混合');
      // And the number must still be a number.
      expect(sheet).toContain('<v>5.844</v>');
    } finally {
      fs.unlinkSync(file);
      fs.rmSync(out, { recursive: true, force: true });
    }
  });

  it('should handle an empty row set without producing an invalid sheet', () => {
    const bytes = toXlsx([]);
    expect(bytes.length).toBeGreaterThan(0);
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it('should store entries uncompressed, so no compressor is needed', () => {
    // Method 0 in the local header. If this ever becomes 8, the writer has
    // grown a deflate dependency it does not have.
    const bytes = toXlsx([[1]]);
    const method = bytes[8] | (bytes[9] << 8);
    expect(method).toBe(0);
  });
});

describe('concat', () => {
  it('should join byte arrays in order', () => {
    const out = concat([new Uint8Array([1, 2]), new Uint8Array([3])]);
    expect([...out]).toEqual([1, 2, 3]);
  });

  it('should handle an empty list', () => {
    expect(concat([]).length).toBe(0);
  });
});
