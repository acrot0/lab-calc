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
import { fieldLabel } from './field-labels.mjs';

export const CSV_COLUMNS = ['时间', '类型', '说明', '输入', '结果'];

/**
 * The same five columns, per locale.
 *
 * The CSV header was Chinese in both locales, so an English user opening the
 * file got Chinese column headings — and, worse, so did the Markdown table
 * they paste into an English notebook. The keys stay Chinese in the default
 * locale because that is the app's default and the shipped behaviour.
 */
const COLUMNS_BY_LOCALE = {
  zh: CSV_COLUMNS,
  en: ['Time', 'Type', 'Summary', 'Inputs', 'Results'],
};

export function columnsFor(locale = 'zh') {
  return COLUMNS_BY_LOCALE[locale] ?? COLUMNS_BY_LOCALE.zh;
}

/**
 * The tab a record came from, per locale.
 *
 * The key is the record's stored `kind`, which is part of the data format and
 * must not change when a label is reworded — the same reasoning as
 * `field-labels.mjs`. The English column was missing until the export was
 * reviewed: an English user's CSV said `称量配制` in the Type column, which is
 * the one column that tells them what the row even is.
 */
const KIND_NAMES = {
  massForMolarity: { zh: '称量配制', en: 'Weigh & prepare' },
  stockFromSolid: { zh: '称量配制', en: 'Weigh & prepare' },
  dilution: { zh: '稀释', en: 'Dilution' },
  dilutionSeries: { zh: '梯度稀释', en: 'Serial dilution' },
  bufferRecipe: { zh: '缓冲液', en: 'Buffer' },
  phCalc: { zh: 'pH 计算', en: 'pH' },
  percentSolution: { zh: '百分比配制', en: 'Percent solution' },
  titrationCurve: { zh: '滴定曲线', en: 'Titration curve' },
  reagent: { zh: '浓试剂', en: 'Concentrated reagent' },
  spectro: { zh: '分光光度', en: 'Spectrophotometry' },
  lab: { zh: '实验台计算', en: 'Bench calculator' },
  colligative: { zh: '依数性', en: 'Colligative' },
  reaction: { zh: '反应计量', en: 'Reaction stoichiometry' },
  electro: { zh: '电化学', en: 'Electrochemistry' },
};

/** A record's kind in the reader's language, falling back to the stored key. */
export function kindName(kind, locale = 'zh') {
  const entry = KIND_NAMES[kind];
  if (!entry) return kind ?? '';
  return entry[locale] ?? entry.zh;
}

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

/**
 * Flatten the inputs/outputs objects into a readable single cell.
 *
 * The field is labelled and the value carries its unit, because the alternative
 * is a cell reading `massG=14.61` — which is the key the code uses, not a word
 * anyone reads. `fieldLabel` already returns the unit inside the label
 * (`质量 (g)`), so the value itself stays a bare number: writing `14.61 g`
 * beside a header that already says `(g)` would state the unit twice, and in a
 * spreadsheet column that is what breaks the ability to sum it.
 */
function flatten(obj, locale = 'zh') {
  if (!obj || typeof obj !== 'object') return '';
  return Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined && typeof v !== 'object')
    .map(([k, v]) => `${fieldLabel(k, locale)}=${v}`)
    .join('; ');
}

/**
 * A timestamp a person can read.
 *
 * Records store ISO-8601 in UTC, which is right for storage — it sorts, it
 * round-trips, and it does not depend on where the machine was. It is wrong for
 * a document: `2026-09-25T17:12:14.457Z` in a lab notebook column is noise, and
 * its reader has to do the timezone arithmetic themselves. This renders the
 * same instant in the reader's own zone.
 *
 * The seconds are dropped. A history entry's second is not information anyone
 * acts on, and keeping it makes every column wider for no gain.
 */
export function localStamp(at, locale = 'zh') {
  if (!at) return '';
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return String(at);
  return d.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function toCsv(entries, locale = 'zh') {
  const rows = [columnsFor(locale).join(',')];
  for (const e of entries ?? []) {
    rows.push([
      localStamp(e?.at, locale),
      kindName(e?.kind, locale),
      e?.summary ?? '',
      flatten(e?.inputs, locale),
      flatten(e?.outputs, locale),
    ].map(escapeCsvField).join(','));
  }
  // Trailing newline: POSIX convention, and it keeps `wc -l` honest.
  return `${rows.join('\n')}\n`;
}

/** Escape a pipe so it cannot break out of its table cell. */
const escapeMd = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function toMarkdown(entries, locale = 'zh') {
  const columns = columnsFor(locale);
  const header = `| ${columns.join(' | ')} |`;
  const sep = `|${columns.map(() => '---').join('|')}|`;
  const rows = (entries ?? []).map((e) => `| ${
    [
      localStamp(e?.at, locale),
      kindName(e?.kind, locale),
      e?.summary ?? '',
      flatten(e?.inputs, locale),
      flatten(e?.outputs, locale),
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
const DETAIL_META = { zh: ['时间', '类型', '说明'], en: ['Time', 'Type', 'Summary'] };

const detailMeta = (locale) => DETAIL_META[locale] ?? DETAIL_META.zh;

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

function toXlsxRows(entries, locale = 'zh') {
  const rows = [columnsFor(locale)];
  for (const e of entries ?? []) {
    rows.push([
      localStamp(e?.at, locale),
      kindName(e?.kind, locale),
      e?.summary ?? '',
      flatten(e?.inputs, locale),
      flatten(e?.outputs, locale),
    ]);
  }
  return rows;
}

/**
 * The detailed sheet: one column per input and per output.
 *
 * The header is the **label**, with its unit, in a single cell — `体积 (mL)`,
 * not `volumeMl（输入）`. This is the change the export needed most: the raw
 * key is a code identifier, and a spreadsheet column headed `massG` is a data
 * dump rather than a lab record. The unit belongs in the header cell rather
 * than in every data cell, which is also what keeps the column numerically
 * sortable — `14.61 g` as text cannot be summed, and a second header row
 * carrying the units would break every machine reader of the file.
 *
 * The `(输入)` / `(结果)` suffix is kept because a field can appear on both
 * sides — `molarity` is an input on one tab and a result on another — and two
 * columns with the same heading and different contents is a trap.
 */
function toXlsxDetailedRows(entries, locale = 'zh') {
  const { inputKeys, outputKeys } = detailColumns(entries);
  const io = locale === 'en' ? { in: 'in', out: 'out' } : { in: '输入', out: '结果' };
  const header = [
    ...detailMeta(locale),
    ...inputKeys.map((k) => `${fieldLabel(k, locale)}（${io.in}）`),
    ...outputKeys.map((k) => `${fieldLabel(k, locale)}（${io.out}）`),
  ];
  const rows = [header];
  for (const e of entries ?? []) {
    rows.push([
      localStamp(e?.at, locale),
      kindName(e?.kind, locale),
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
export function downloadCsv(entries, locale = 'zh') {
  return downloadFile(UTF8_BOM + toCsv(entries, locale), exportFilename('csv'), 'text/csv;charset=utf-8');
}

export function downloadMarkdown(entries, locale = 'zh') {
  return downloadFile(toMarkdown(entries, locale), exportFilename('markdown'), 'text/markdown;charset=utf-8');
}

export function downloadBundle(entries) {
  return downloadFile(toBundle(entries), exportFilename('json'), 'application/json;charset=utf-8');
}

/**
 * The metadata sheet.
 *
 * A spreadsheet of numbers with no statement of what they are is only useful to
 * the person who exported it, on the day they exported it. This records the
 * things a reader six months later cannot recover from the data: which software
 * and version wrote the file, when, which fields are present and what each one
 * is measured in, and the standing caveat that this is a teaching tool.
 *
 * The field list is generated from the same `fieldLabel` the columns use, so
 * the sheet cannot describe a column differently from how the column is headed.
 */
function toMetaRows(entries, locale, now) {
  const { inputKeys, outputKeys } = detailColumns(entries);
  const zh = locale !== 'en';
  const L = zh
    ? { title: '说明', item: '项目', value: '内容', fields: '字段与单位', io: '来源', in: '输入', out: '结果' }
    : { title: 'Notes', item: 'Item', value: 'Value', fields: 'Fields and units', io: 'Side', in: 'input', out: 'output' };

  const rows = [
    [L.title, ''],
    [L.item, L.value],
    [zh ? '软件' : 'Software', 'Lab Calc'],
    [zh ? '版本' : 'Version', typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''],
    [zh ? '导出时间' : 'Exported', localStamp(now.toISOString(), locale)],
    [zh ? '记录条数' : 'Records', entries?.length ?? 0],
    [zh ? '时区' : 'Time zone', Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''],
    [],
    [L.fields, ''],
    [zh ? '字段' : 'Field', L.io],
    ...inputKeys.map((k) => [fieldLabel(k, locale), L.in]),
    ...outputKeys.map((k) => [fieldLabel(k, locale), L.out]),
    [],
    [zh
      ? '本文件由 Lab Calc 导出，仅供教学与预习核对，不可用于临床、诊断或生产。'
      : 'Exported from Lab Calc. For teaching and pre-lab checking only — not for clinical, diagnostic or production use.', ''],
  ];
  return rows;
}

/**
 * Download an .xlsx.
 *
 * The bytes go through a Blob rather than a string, so `downloadFile` takes
 * the `Uint8Array` unchanged. The MIME type is the registered one for xlsx;
 * getting it wrong makes Excel refuse the file on a double-click even though
 * the content is fine.
 *
 * Two sheets: the data, and the notes that make the data readable later. The
 * data sheet is first, because that is what the file is for.
 */
export function downloadXlsx(entries, { detailed = true, now = new Date(), locale = 'zh' } = {}) {
  const zh = locale !== 'en';
  const rows = detailed ? toXlsxDetailedRows(entries, locale) : toXlsxRows(entries, locale);
  const meta = toMetaRows(entries, locale, now);
  const bytes = toXlsx(rows, {
    sheetName: detailed ? (zh ? '计算结果' : 'Results') : 'History',
    widths: widthsFor(rows),
    // The notes sheet is one narrow column of prose and one of values; the
    // widths come from its own content rather than the data sheet's.
    extraSheets: [{
      name: zh ? '说明' : 'Notes',
      rows: meta,
      widths: widthsFor(meta, { min: 10, max: 60 }),
    }],
    now,
  });
  const name = detailed
    ? `lab-calc-${zh ? '详细' : 'detailed'}-${now.toISOString().slice(0, 10)}.xlsx`
    : exportFilename('xlsx', now);
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

