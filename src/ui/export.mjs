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

const EXT = { csv: 'csv', markdown: 'md', md: 'md', json: 'json' };

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
export function downloadFile(content, filename, mime = 'text/plain;charset=utf-8') {
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

