/**
 * A minimal .xlsx writer.
 *
 * ## Why not a library
 *
 * `exceljs` is the obvious choice and was measured before rejecting it: 925 KB
 * minified and nine transitive dependencies (`archiver`, `jszip`, `saxes`,
 * `unzipper`, `uuid`, …). `xlsx` (SheetJS) is smaller but its community build
 * is Apache-2.0 with a commercial tier, and the maintained distribution has
 * moved off npm.
 *
 * This project already hand-writes a PNG encoder rather than pull in canvas,
 * for the same reason: the format needed here is a small, fully-specified
 * subset, and a dependency that is 900 KB to emit five columns of text is a
 * worse trade than 200 lines that can be tested.
 *
 * ## What an .xlsx actually is
 *
 * A ZIP archive of XML parts. Nothing more. The five parts below are the
 * minimum Excel and LibreOffice both accept, and the sheet uses `inlineStr`
 * cells so there is no shared-string table to build and keep consistent.
 *
 * ## Why the ZIP entries are uncompressed
 *
 * Deflate would need a compressor — `fflate` is another dependency, and
 * `CompressionStream` is not in every browser this app supports. ZIP allows
 * stored (uncompressed) entries, so the archive is built with a CRC-32 and two
 * sizes and no compressor at all. A history export is a few kilobytes of text;
 * the compression would save almost nothing and cost a dependency.
 *
 * The one thing that must be right is the CRC-32 and the local/central header
 * agreement. Get either wrong and the file opens as "archive is corrupt" with
 * no hint which entry is at fault, so both are covered by tests that unzip the
 * result and read it back.
 */

/* -------------------------------------------------------------------------
 * CRC-32
 * ---------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

export function crc32(bytes) {
  let c = -1;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/* -------------------------------------------------------------------------
 * ZIP (stored entries only)
 * ---------------------------------------------------------------------- */

const utf8 = (s) => new TextEncoder().encode(s);

/** Little-endian writers, since ZIP is little-endian throughout. */
function u16(v) { return [v & 0xff, (v >> 8) & 0xff]; }
function u32(v) { return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff]; }

/**
 * Build a ZIP from `[{ name, data }]`, storing every entry uncompressed.
 *
 * The local header precedes each entry's bytes; the central directory repeats
 * every entry's metadata at the end. The two must agree field for field, which
 * is why both are written from the same `entries` loop rather than duplicated.
 */
export function zip(files, now = new Date()) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  // DOS date/time, which is what ZIP has used since 1982. The seconds field
  // holds half-seconds, so it is truncated rather than rounded.
  const dosTime = u16((now.getHours() << 11) | (now.getMinutes() << 5)
    | Math.floor(now.getSeconds() / 2));
  const dosDate = u16(((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5)
    | now.getDate());

  for (const f of files) {
    const nameBytes = utf8(f.name);
    const { data } = f;
    const sum = crc32(data);

    /*
     * Local file header: 30 fixed bytes, then the name, then the data.
     *
     * The field order is fixed by the spec and the sizes must be exact — a
     * header one byte short makes every subsequent offset wrong, and the only
     * symptom is a reader reporting that it cannot find the central directory.
     */
    const local = [
      0x50, 0x4b, 0x03, 0x04,        // signature
      ...u16(20),                     // version needed to extract
      ...u16(0x0800),                 // flags: bit 11 = names are UTF-8
      ...u16(0),                      // method 0 = stored, no compression
      ...dosTime, ...dosDate,
      ...u32(sum),
      ...u32(data.length),            // compressed size (== uncompressed)
      ...u32(data.length),            // uncompressed size
      ...u16(nameBytes.length),
      ...u16(0),                      // extra field length
    ];
    localParts.push(new Uint8Array(local), nameBytes, data);

    /*
     * Central directory header: 46 fixed bytes, then the name.
     *
     * The name is NOT written into the data stream — an earlier version pushed
     * it after each entry's bytes, which put 95 stray bytes in the middle of
     * the archive and made every reader reject the file. The name belongs here
     * and in the local header, and nowhere else.
     */
    const central = [
      0x50, 0x4b, 0x01, 0x02,        // signature
      ...u16(20),                     // version made by
      ...u16(20),                     // version needed to extract
      ...u16(0x0800),                 // flags
      ...u16(0),                      // method
      ...dosTime, ...dosDate,
      ...u32(sum),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(nameBytes.length),
      ...u16(0),                      // extra field length
      ...u16(0),                      // comment length
      ...u16(0),                      // disk number start
      ...u16(0),                      // internal attributes
      ...u32(0),                      // external attributes
      ...u32(offset),                 // offset of this entry's local header
    ];
    centralParts.push(new Uint8Array(central), nameBytes);

    offset += local.length + nameBytes.length + data.length;
  }

  const centralStart = offset;
  const centralBytes = concat(centralParts);

  // End of central directory: 22 bytes, and the counts and sizes must match
  // what was actually written or a reader stops at the first entry.
  const end = [
    0x50, 0x4b, 0x05, 0x06,
    ...u16(0), ...u16(0),           // this disk, and the disk with the directory
    ...u16(files.length), ...u16(files.length),
    ...u32(centralBytes.length),
    ...u32(centralStart),
    ...u16(0),                      // comment length
  ];

  return concat([...localParts, centralBytes, new Uint8Array(end)]);
}

/** Concatenate byte arrays into one. */
export function concat(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/* -------------------------------------------------------------------------
 * SpreadsheetML
 * ---------------------------------------------------------------------- */

/**
 * XML text escaping.
 *
 * Beyond the five predefined entities this strips the control characters XML
 * 1.0 forbids outright. They cannot be escaped — a literal 0x01 in a cell makes
 * the file unparseable, and Excel reports only "we found a problem with some
 * content" without saying where. A summary string built from user input can
 * contain one, so they are removed rather than passed through.
 */
export function escapeXml(value) {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Column letter for a zero-based index: 0 → A, 26 → AA. */
export function columnName(index) {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/**
 * The two cell styles this writer emits.
 *
 * xlsx styles live in a separate part and are referenced by index, so a cell
 * carries `s="1"` rather than any formatting of its own. Two are defined:
 *
 *   0 — the default, no formatting.
 *   1 — a header: bold, filled, with a bottom rule.
 *
 * The fill is a fixed neutral grey rather than a theme colour. The palette is
 * chosen by the user in the app and the file outlives that choice, so a header
 * tinted with today's accent would look arbitrary in a spreadsheet opened in a
 * different context — and Excel's own default header styling is neutral for
 * the same reason.
 */
const STYLES_XML = `${XML_HEAD}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
  + '<fonts count="2">'
  + '<font><sz val="11"/><name val="Calibri"/></font>'
  + '<font><b/><sz val="11"/><color rgb="FF1A1A1A"/><name val="Calibri"/></font>'
  + '</fonts>'
  + '<fills count="3">'
  + '<fill><patternFill patternType="none"/></fill>'
  + '<fill><patternFill patternType="gray125"/></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFEDEDED"/><bgColor indexed="64"/></patternFill></fill>'
  + '</fills>'
  + '<borders count="2">'
  + '<border><left/><right/><top/><bottom/><diagonal/></border>'
  + '<border><left/><right/><top/><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>'
  + '</borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="2">'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>'
  + '</cellXfs>'
  // `cellStyles` is not optional in practice: without a named "Normal" style
  // openpyxl warns "Workbook contains no default style", and Excel has been
  // observed to repair the file on open. It costs one element to be correct.
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>';

/** The style index a header row's cells carry. */
const HEADER_STYLE = 1;

/**
 * One worksheet.
 *
 * `widths` is applied as explicit column widths. Without them every column is
 * the default 8.43 characters, and a Chinese summary is truncated to a few
 * glyphs — the file is correct but useless to read, which is the failure the
 * user actually notices.
 *
 * `headerRows` is how many leading rows are styled and frozen. Styling is what
 * makes a wide sheet readable; freezing is what keeps the headings on screen
 * when the reader scrolls to row 300, which is the point at which a spreadsheet
 * of history becomes usable rather than merely correct.
 *
 * It defaults to none, because this function's contract is a grid of cells and
 * whether a row is a heading is the caller's knowledge, not the writer's.
 * `workbookParts` is where that decision is made, and it defaults to one.
 */
export function sheetXml(rows, widths = [], { headerRows = 0 } = {}) {
  const cols = widths.length > 0
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';

  const body = rows.map((row, r) => {
    const isHeader = r < headerRows;
    const cells = row.map((value, c) => {
      if (value === null || value === undefined || value === '') {
        return isHeader ? `<c r="${columnName(c)}${r + 1}" s="${HEADER_STYLE}"/>` : '';
      }
      const ref = `${columnName(c)}${r + 1}`;
      /*
       * Numbers are written as numbers, not text.
       *
       * A cell holding the string "0.5" looks identical on screen but cannot be
       * summed, sorted numerically, or plotted — which is most of the reason to
       * export a spreadsheet rather than a CSV. Only values that are finite
       * numbers *and* were given as numbers take this path; a string that looks
       * numeric stays text, so a formula name or a zero-padded id is not
       * silently reinterpreted.
       */
      if (typeof value === 'number' && Number.isFinite(value)) {
        const style = isHeader ? ` s="${HEADER_STYLE}"` : '';
        return `<c r="${ref}"${style}><v>${value}</v></c>`;
      }
      const style = isHeader ? ` s="${HEADER_STYLE}"` : '';
      return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');

  // Freeze the header rows: scrolling a long history otherwise loses the column
  // names, and a column of numbers with no heading is not a record.
  const pane = headerRows > 0
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRows}" topLeftCell="A${headerRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : '';

  return `${XML_HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `${pane}${cols}<sheetData>${body}</sheetData></worksheet>`;
}

/**
 * Every sheet in the workbook, the first being the data.
 *
 * `extraSheets` are appended after it, each `{ name, rows, widths }`. The
 * first sheet is the one Excel opens on, so the data has to be the one built
 * from `rows` rather than an entry in the list.
 */
function sheetsOf(rows, { sheetName, widths, headerRows, extraSheets = [] }) {
  return [
    { name: sheetName, rows, widths, headerRows },
    ...extraSheets.map((s) => ({
      name: s.name,
      rows: s.rows,
      widths: s.widths ?? [],
      headerRows: s.headerRows ?? 0,
    })),
  ];
}

/** The parts, in the order they are written into the archive. */
export function workbookParts(rows, options = {}) {
  const {
    sheetName = 'History', widths = [], headerRows = 1,
  } = options;
  const sheets = sheetsOf(rows, { ...options, sheetName, widths, headerRows });

  const overrides = sheets.map((_, i) => '<Override PartName="/xl/worksheets/'
    + `sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');

  const sheetTags = sheets.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');

  // rId 1..n are the sheets; the styles part takes the next free id.
  const styleRid = sheets.length + 1;
  const relTags = sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    + `<Relationship Id="rId${styleRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;

  return [
    {
      name: '[Content_Types].xml',
      data: utf8(`${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + `${overrides}`
        + '</Types>'),
    },
    {
      name: '_rels/.rels',
      data: utf8(`${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        + '</Relationships>'),
    },
    {
      name: 'xl/workbook.xml',
      data: utf8(`${XML_HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" `
        + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + `<sheets>${sheetTags}</sheets></workbook>`),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: utf8(`${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
        + `${relTags}</Relationships>`),
    },
    { name: 'xl/styles.xml', data: utf8(STYLES_XML) },
    ...sheets.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: utf8(sheetXml(s.rows, s.widths, { headerRows: s.headerRows })),
    })),
  ];
}

/** The complete .xlsx file as bytes. */
export function toXlsx(rows, options = {}) {
  return zip(workbookParts(rows, options), options.now ?? new Date());
}
