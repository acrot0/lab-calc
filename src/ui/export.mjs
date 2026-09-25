/**
 * Export the calculation history as CSV or Markdown.
 *
 * Why this matters more than it looks: the whole premise of this tool is that
 * a calculation should outlive the moment you did it. Keeping it only inside
 * localStorage means it dies with the browser profile. Export is what lets a
 * chemist paste a preparation into the lab notebook they are actually required
 * to keep.
 *
 * Pure string generation — the download plumbing lives in the component, so
 * the formatting can be tested without a DOM.
 */

import { toXlsx } from './xlsx.mjs';

export const CSV_COLUMNS = ['时间', '类型', '说明', '输入', '结果'];

const KIND_NAMES = {
  massForMolarity: '称量配制',
  stockFromSolid: '称量配制',
  dilution: '稀释',
  dilutionSeries: '梯度稀释',
  bufferRecipe: '缓冲液',
  phCalc: 'pH 计算',
  percentSolution: '百分比配制',
  titrationCurve: '滴定曲线',
  reagent: '浓试剂',
  spectro: '分光光度',
  lab: '实验台计算',
  colligative: '依数性',
  reaction: '反应计量',
  electro: '电化学',
};

/**
 * RFC 4180 field escaping.
 *
 * A value containing a comma, quote or newline must be quoted, and internal
 * quotes doubled. Skipping this shifts every subsequent column, which is the
 * classic way an exported CSV silently corrupts data.
 */
export function escapeCsvField(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Flatten the inputs/outputs objects into a readable single cell. */
function flatten(obj) {
  if (!obj || typeof obj !== 'object') return '';
  return Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

export function toCsv(entries) {
  const rows = [CSV_COLUMNS.join(',')];
  for (const e of entries ?? []) {
    rows.push([
      e?.at ?? '',
      KIND_NAMES[e?.kind] ?? e?.kind ?? '',
      e?.summary ?? '',
      flatten(e?.inputs),
      flatten(e?.outputs),
    ].map(escapeCsvField).join(','));
  }
  // Trailing newline: POSIX convention, and it keeps `wc -l` honest.
  return `${rows.join('\n')}\n`;
}

/** Escape a pipe so it cannot break out of its table cell. */
const escapeMd = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function toMarkdown(entries) {
  const header = `| ${CSV_COLUMNS.join(' | ')} |`;
  const sep = `|${CSV_COLUMNS.map(() => '---').join('|')}|`;
  const rows = (entries ?? []).map((e) => `| ${
    [
      e?.at ?? '',
      KIND_NAMES[e?.kind] ?? e?.kind ?? '',
      e?.summary ?? '',
      flatten(e?.inputs),
      flatten(e?.outputs),
    ].map(escapeMd).join(' | ')
  } |`);
  return [header, sep, ...rows].join('\n');
}

/**
 * The history as spreadsheet rows.
 *
 * Two shapes, because two different jobs:
 *
 * `toXlsx` writes the same five columns the CSV has, for a quick paste into a
 * report. `toXlsxDetailed` gives every input and every output its own column,
 * which is what the five-column form cannot do — a flattened
 * `volume=500; molarity=0.5` cell cannot be sorted, filtered, or averaged,
 * which is most of the reason to open a spreadsheet rather than read a CSV.
 *
 * The detailed form takes the union of every key across all entries, in the
 * order first seen, so a column is never dropped because one row lacked it.
 * A missing value is left blank rather than zero-filled: an entry that never
 * recorded a temperature is not an entry that recorded 0 °C.
 */
const DETAIL_META = ['时间', '类型', '说明'];

/** Every input/output key across the set, in first-seen order. */
function detailColumns(entries) {
  const inputKeys = [];
  const outputKeys = [];
  for (const e of entries ?? []) {
    for (const k of Object.keys(e?.inputs ?? {})) {
      if (!inputKeys.includes(k)) inputKeys.push(k);
    }
    for (const k of Object.keys(e?.outputs ?? {})) {
      if (!outputKeys.includes(k)) outputKeys.push(k);
    }
  }
  return { inputKeys, outputKeys };
}

/** A cell value: scalars only, so an object never lands in a spreadsheet cell. */
function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? v : '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function toXlsxRows(entries) {
  const rows = [CSV_COLUMNS];
  for (const e of entries ?? []) {
    rows.push([
      e?.at ?? '',
      KIND_NAMES[e?.kind] ?? e?.kind ?? '',
      e?.summary ?? '',
      flatten(e?.inputs),
      flatten(e?.outputs),
    ]);
  }
  return rows;
}

function toXlsxDetailedRows(entries) {
  const { inputKeys, outputKeys } = detailColumns(entries);
  const header = [
    ...DETAIL_META,
    ...inputKeys.map((k) => `${k}（输入）`),
    ...outputKeys.map((k) => `${k}（结果）`),
  ];
  const rows = [header];
  for (const e of entries ?? []) {
    rows.push([
      e?.at ?? '',
      KIND_NAMES[e?.kind] ?? e?.kind ?? '',
      e?.summary ?? '',
      ...inputKeys.map((k) => cell(e?.inputs?.[k])),
      ...outputKeys.map((k) => cell(e?.outputs?.[k])),
    ]);
  }
  return rows;
}

/**
 * Column widths for a row set.
 *
 * Excel's default is 8.43 characters, which truncates a Chinese summary to a
 * few glyphs. Widths are estimated from the longest cell, with CJK characters
 * counted double because they are double-width in a monospace grid — the file
 * is correct without this, but unreadable, and an unreadable export is the
 * failure the user actually notices.
 */
function widthsFor(rows, { min = 8, max = 42 } = {}) {
  const cols = rows.reduce((n, r) => Math.max(n, r.length), 0);
  const out = [];
  for (let c = 0; c < cols; c += 1) {
    let widest = 0;
    for (const r of rows) {
      const s = String(r[c] ?? '');
      // CJK and fullwidth forms occupy two columns in a spreadsheet.
      const width = [...s].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/.test(ch) ? 2 : 1), 0);
      if (width > widest) widest = width;
    }
    out.push(Math.min(max, Math.max(min, widest + 2)));
  }
  return out;
}

const EXT = { csv: 'csv', markdown: 'md', md: 'md', json: 'json', xlsx: 'xlsx' };

/** Date-stamped so repeated exports do not overwrite each other. */
export function exportFilename(format, now = new Date()) {
  const d = now.toISOString().slice(0, 10);
  return `lab-calc-${d}.${EXT[format] ?? 'txt'}`;
}

/**
 * Byte-order mark for CSV.
 *
 * Excel on Windows does not sniff UTF-8. Without a BOM it decodes the file as
 * the system ANSI codepage, and every Chinese character in the export becomes
 * mojibake — the columns still line up, so the corruption looks like the data
 * rather than a bug. LibreOffice and modern Excel both accept the BOM; nothing
 * meaningful rejects it.
 */
export const UTF8_BOM = '﻿';

/**
 * Trigger a download in the browser.
 *
 * Kept out of the pure functions above so they stay testable, and wrapped in a
 * guard because it touches DOM APIs that do not exist in Node.
 */
function downloadFile(content, filename, mime = 'text/plain;charset=utf-8') {
  if (typeof document === 'undefined') return false;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

/** Download CSV with the BOM Excel needs to read Chinese correctly. */
export function downloadCsv(entries) {
  return downloadFile(UTF8_BOM + toCsv(entries), exportFilename('csv'), 'text/csv;charset=utf-8');
}

export function downloadMarkdown(entries) {
  return downloadFile(toMarkdown(entries), exportFilename('markdown'), 'text/markdown;charset=utf-8');
}

export function downloadBundle(entries) {
  return downloadFile(toBundle(entries), exportFilename('json'), 'application/json;charset=utf-8');
}

/**
 * Download an .xlsx.
 *
 * The bytes go through a Blob rather than a string, so `downloadFile` takes
 * the `Uint8Array` unchanged. The MIME type is the registered one for xlsx;
 * getting it wrong makes Excel refuse the file on a double-click even though
 * the content is fine.
 */
export function downloadXlsx(entries, { detailed = true, now = new Date() } = {}) {
  const rows = detailed ? toXlsxDetailedRows(entries) : toXlsxRows(entries);
  const bytes = toXlsx(rows, {
    sheetName: detailed ? '计算结果' : 'History',
    widths: widthsFor(rows),
    now,
  });
  const name = detailed ? `lab-calc-详细-${now.toISOString().slice(0, 10)}.xlsx` : exportFilename('xlsx', now);
  return downloadFile(bytes, name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/* ==========================================================================
   Portable bundle (JSON)
   --------------------------------------------------------------------------
   CSV and Markdown are for reading — they flatten the inputs and lose the
   structure needed to replay a calculation. The bundle keeps the records
   intact so history can move between machines, which is the actual need: a
   bench computer, a laptop, a new browser profile.
   ========================================================================== */

export const BUNDLE_FORMAT = 'lab-calc.history';
export const BUNDLE_VERSION = 1;

/**
 * The version is written from the first release, even though nothing reads it
 * yet. A format that gains a version only when it first breaks has already
 * shipped files nobody can migrate.
 */
export function toBundle(entries, now = new Date()) {
  return JSON.stringify({
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    exportedAt: now.toISOString(),
    entries: entries ?? [],
  }, null, 2);
}

/** Reject anything without the shape a replayed entry needs. */
function isUsableEntry(e) {
  return Boolean(e) && typeof e === 'object' && typeof e.kind === 'string';
}

/**
 * Parse a bundle back into entries.
 *
 * Returns a result object rather than throwing: a wrong file is an ordinary
 * mistake, and the caller needs the reason to tell the user which file to
 * pick instead. Rows that fail validation are dropped with a count instead of
 * failing the whole import — a partially usable file beats no import at all.
 */
export function parseBundle(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, code: 'notJson', entries: [], dropped: 0 };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, code: 'notBundle', entries: [], dropped: 0 };
  }
  if (data.format !== BUNDLE_FORMAT) {
    return { ok: false, code: 'wrongFormat', entries: [], dropped: 0 };
  }
  if (!Number.isInteger(data.version) || data.version < 1) {
    return { ok: false, code: 'badVersion', entries: [], dropped: 0 };
  }
  if (data.version > BUNDLE_VERSION) {
    // Fail loudly rather than importing a subset: a newer file may carry
    // fields this build would silently drop on the next save, and quietly
    // destroying data is worse than refusing to open it.
    return { ok: false, code: 'newerVersion', entries: [], dropped: 0 };
  }
  if (!Array.isArray(data.entries)) {
    return { ok: false, code: 'notBundle', entries: [], dropped: 0 };
  }
  const entries = data.entries.filter(isUsableEntry);
  return { ok: true, code: null, entries, dropped: data.entries.length - entries.length };
}

/**
 * Merge imported entries with the existing history.
 *
 * Deduplicated by `id`, which `addEntry` makes unique per calculation — so
 * importing the same file twice is idempotent rather than doubling the list.
 * Newest first, matching how the list is ordered everywhere else.
 */
export function mergeEntries(existing, incoming, max = Infinity) {
  const seen = new Set();
  const merged = [];
  for (const e of [...(existing ?? []), ...(incoming ?? [])]) {
    if (!e || typeof e.id !== 'string' || seen.has(e.id)) continue;
    seen.add(e.id);
    merged.push(e);
  }
  merged.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
  return merged.slice(0, max);
}

