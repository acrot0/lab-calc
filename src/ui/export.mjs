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

import { fieldLabel } from './field-labels.mjs';
import { getTemplate, fieldOf as templateField, labelOf } from './field-template.mjs';
import { proceduresFor } from './procedure.mjs';
import { DISCLAIMER_POINTS } from './disclaimer.mjs';
import { zh } from './locales/zh.mjs';
import { en } from './locales/en.mjs';

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

/**
 * The metadata fields at least one of these records actually carries, in
 * template order.
 *
 * Appended to every export rather than always written: an empty column is a
 * claim that something was measured and came out blank, and every existing
 * user's spreadsheet would gain columns of nothing. A user who never annotates
 * a record sees exactly the file they saw before.
 *
 * The template is consulted for the *label* even when the field has since been
 * retired. A record that carries a sample number must still export it under a
 * heading; dropping the definition would emit a column with nothing to name it,
 * which is the one thing the metadata whitelist exists to prevent.
 */
function usedMetaFields(entries) {
  const seen = new Set();
  for (const e of entries ?? []) {
    for (const k of Object.keys(e?.meta ?? {})) seen.add(k);
  }
  const template = getTemplate();
  const ordered = template.filter((f) => seen.has(f.key));
  // A key with no definition at all — a record from a build whose template has
  // since been removed, or a hand-edited bundle. It gets a heading of its own
  // key rather than being silently dropped, because the data is real.
  const orphans = [...seen].filter((k) => !templateField(template, k));
  return [...ordered, ...orphans.map((k) => ({ key: k, label: { zh: k, en: k } }))];
}

/** The metadata labels for the header row, in the reader's language. */
function metaLabels(fields, locale = 'zh') {
  return fields.map((f) => labelOf(f, locale));
}

/** One record's metadata values, in the same order as `fields`. */
function metaValues(fields, entry) {
  return fields.map((f) => entry?.meta?.[f.key] ?? '');
}

function columnsFor(locale = 'zh') {
  return COLUMNS_BY_LOCALE[locale] ?? COLUMNS_BY_LOCALE.zh;
}

/**
 * The name of a record's kind, from the locale files.
 *
 * The key is the record's stored `kind`, which is part of the data format and
 * must not change when a label is reworded — the same reasoning as
 * `field-labels.mjs`. The English column was missing until the export was
 * reviewed: an English user's CSV said `称量配制` in the Type column, which is
 * the one column that tells them what the row even is.
 *
 * ## Why this reads the locale files rather than a table here
 *
 * It had its own table, and the table is now gone. Two tables naming the same
 * set drifted in the only way that is invisible: both were complete for the
 * fourteen original kinds and this one was never extended for the five added
 * later, so a bio record exported as `bio` while the history list, the printed
 * report and the app's own tab bar all called it 生物. The subset it happened
 * to cover was exactly the subset nobody had added recently, which is why
 * reading it looked fine.
 *
 * A locale lookup cannot disagree with the locale files, and `test/kind-registry`
 * asserts every recorded kind resolves in both languages — so the fallback
 * below is reached only by a record from a removed tab, where the raw key is
 * the most informative thing available.
 */
function kindName(kind, locale = 'zh') {
  if (kind === null || kind === undefined) return '';
  const dict = locale === 'en' ? en : zh;
  return dict.kinds?.[kind] ?? kind;
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
  const fields = usedMetaFields(entries);
  const rows = [[...columnsFor(locale), ...metaLabels(fields, locale)].join(',')];
  for (const e of entries ?? []) {
    rows.push([
      localStamp(e?.at, locale),
      kindName(e?.kind, locale),
      e?.summary ?? '',
      flatten(e?.inputs, locale),
      flatten(e?.outputs, locale),
      ...metaValues(fields, e),
    ].map(escapeCsvField).join(','));
  }
  // Trailing newline: POSIX convention, and it keeps `wc -l` honest.
  return `${rows.join('\n')}\n`;
}

/** Escape a pipe so it cannot break out of its table cell. */
const escapeMd = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/**
 * The history as a Markdown table, with a notes footer.
 *
 * The table comes first because it is what the export is for. The footer is
 * what makes it safe to paste: this is the format that ends up in a lab
 * notebook or a report draft, and a bare table of numbers travels with no
 * statement of what the model does and does not correct for. The xlsx answers
 * that with a notes sheet; Markdown has prose, which carries it better.
 *
 * `toCsv` deliberately does not get the same treatment — the reasoning is on
 * that function, and the short version is that a CSV's value is being parsed.
 */
export function toMarkdown(entries, locale = 'zh', now = new Date()) {
  const fields = usedMetaFields(entries);
  const columns = [...columnsFor(locale), ...metaLabels(fields, locale)];
  const header = `| ${columns.join(' | ')} |`;
  const sep = `|${columns.map(() => '---').join('|')}|`;
  const rows = (entries ?? []).map((e) => `| ${
    [
      localStamp(e?.at, locale),
      kindName(e?.kind, locale),
      e?.summary ?? '',
      flatten(e?.inputs, locale),
      flatten(e?.outputs, locale),
      ...metaValues(fields, e),
    ].map(escapeMd).join(' | ')
  } |`);
  return [
    ...markdownHeader(entries, locale, now),
    header, sep, ...rows,
    '',
    ...markdownRecipes(entries, locale),
    ...markdownNotes(entries, locale, fields),
  ].join('\n');
}

/**
 * The provenance block, above the table.
 *
 * A table pasted into a report appendix has to be able to say where it came
 * from. Six months later, in someone else's document, "which version of what
 * produced these numbers, and when" is the first question and the one a bare
 * table cannot answer.
 *
 * The same facts the xlsx notes sheet carries, in the same order, so the two
 * exports describe themselves identically. `BUNDLE_VERSION` is included because
 * it is the format version rather than the app version — the two move
 * independently, and a reader comparing a Markdown table against a JSON bundle
 * needs to know which is which.
 *
 * The date is passed in rather than read here, so the output is a function of
 * its arguments and a test can pin it.
 */
function markdownHeader(entries, locale, now) {
  const zh = locale !== 'en';
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
  const when = now instanceof Date ? now : new Date();
  const stamp = Number.isNaN(when.getTime()) ? '' : localStamp(when.toISOString(), locale);
  const rows = [
    [zh ? '软件' : 'Software', `Lab Calc${version ? ` ${version}` : ''}`],
    [zh ? '导出时间' : 'Exported', stamp],
    [zh ? '记录条数' : 'Records', String(entries?.length ?? 0)],
    [zh ? '数据格式版本' : 'Data format version', String(BUNDLE_VERSION)],
  ];
  const label = zh ? '项目' : 'Item';
  const value = zh ? '内容' : 'Value';
  return [
    `| ${label} | ${value} |`,
    '|---|---|',
    ...rows.filter(([, v]) => v !== '').map(([k, v]) => `| ${escapeMd(k)} | ${escapeMd(v)} |`),
    '',
  ];
}

/**
 * The recipe cards, between the table and the disclaimer footer.
 *
 * The table is the data; these are the instructions. A person who has to make
 * the solution cannot act on `volume=500; molarity=0.5` — they need the
 * operations in order with the number that goes with each one, which is what
 * `procedure.mjs` derives.
 *
 * Only the kinds that are genuinely procedural get a card. A Nernst potential
 * is arithmetic and has no steps to follow, so nothing is invented for it —
 * a made-up procedure is one somebody would follow.
 *
 * The cards come after the table rather than before it, because the table is
 * what the file is for and the recipe is what makes it actionable. They come
 * before the notes because the notes are about the whole document, not about
 * one record.
 */
function markdownRecipes(entries, locale = 'zh') {
  const cards = proceduresFor(entries, locale);
  if (cards.length === 0) return [];
  const zh = locale !== 'en';
  const heading = zh ? '配制步骤' : 'Preparation steps';
  const from = zh ? '对应记录' : 'Record';
  const out = [`## ${heading}`, ''];

  for (const card of cards) {
    out.push(`### ${card.title}`, '');
    // Which table row this card belongs to. Without it a file with three
    // weighing records has three near-identical cards and no way to tell which
    // is which — the summaries differ by one number.
    if (card.summary) out.push(`> ${from}: ${escapeMd(card.summary)}`, '');
    card.steps.forEach((step, i) => out.push(`${i + 1}. ${step}`));
    out.push('');
  }
  return out;
}

/**
 * The Markdown footer: what wrote the file, and what it does not know.
 *
 * Reuses the same `DISCLAIMER_POINTS` the xlsx notes sheet and the in-app
 * notice read from, so the three cannot disagree — the wording was corrected
 * once already, when the pH tab gained activity correction and the version
 * written for the buffer tab alone became false.
 */
function markdownNotes(entries, locale = 'zh', fields = null) {
  const zh = locale !== 'en';
  const limits = DISCLAIMER_POINTS.find((p) => p.titleEn === 'The model is simplified');
  const verify = DISCLAIMER_POINTS.find((p) => p.titleEn === 'Verify results yourself');
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
  /*
   * The same four headings the xlsx notes sheet uses, which are the headings
   * the README's own section carries. One wording, four places it is read.
   *
   * `use` and `unc` were added after measuring a real export: it carried the
   * model limits and the verify note, but not the teaching-only line, and said
   * nothing at all about the ± now on seven tabs' results. A spreadsheet is the
   * artefact that leaves — pasted into a report, opened six months later by
   * someone who never saw the app — so it is the last place those can be
   * missing.
   */
  const L = zh
    ? { use: '用途限制', limits: '已校正的与未建模的', unc: '不确定度', verify: '核对结果',
        software: '软件', records: '记录条数', fields: '记录字段' }
    : { use: 'Intended use', limits: 'Corrected and not modelled', unc: 'Uncertainty', verify: 'Verify results',
        software: 'Software', records: 'Records', fields: 'Record fields' };
  const section = (heading, p) => [`### ${heading}`, '', `**${zh ? p.titleZh : p.titleEn}**`, '', zh ? p.zh : p.en, ''];

  return [
    '---',
    '',
    ...section(L.use, DISCLAIMER_POINTS.find((p) => p.titleEn === 'Educational use only')),
    ...section(L.use, DISCLAIMER_POINTS.find((p) => p.titleEn === 'Not for clinical, diagnostic, or production use')),
    ...section(L.limits, limits),
    ...section(L.unc, DISCLAIMER_POINTS.find((p) => p.titleEn === 'Results carry an uncertainty')),
    ...section(L.verify, verify),
    `- ${L.software}: Lab Calc${version ? ` ${version}` : ''}`,
    `- ${L.records}: ${entries?.length ?? 0}`,
    /*
     * Which metadata columns this file carries, named.
     *
     * A table with extra columns and no statement of where they came from is
     * unreadable six months later even to the person who made it — "样品号" is a
     * column of strings until something says what produced it and what the
     * field is for. Printed only when the file has such columns, which is when
     * the question can arise.
     */
    ...(fields && fields.length > 0
      ? [`- ${L.fields}: ${fields.map((f) => `${labelOf(f, locale)} (${f.key})`).join(', ')}`]
      : []),
  ];
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
export function detailColumns(entries) {
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

/**
 * What the user is about to download, before they download it.
 *
 * Export used to be a menu item that fired immediately: the file appeared in
 * the downloads bar and the only way to find out what was in it was to open it.
 * With a search active and a column subset chosen, that is a guess — the two
 * things most likely to be wrong (the row set and the column set) are both
 * invisible at the moment of the click.
 *
 * This is the same plan the writer uses, reduced to what a person can read:
 * the columns, how many rows, and the first few of them. It calls the same
 * functions the real export does rather than approximating them, so a preview
 * cannot disagree with the file.
 *
 * Returns `{ format, columns, total, rows }` where `rows` is at most `limit`
 * arrays of already-formatted cell strings. Never throws for an unknown
 * format — it falls back to the CSV shape, which is the five-column view every
 * other format is a variation on.
 */
export function exportPreview(entries, {
  format = 'csv', locale = 'zh', view = 'record', columns, limit = 3,
} = {}) {
  const list = entries ?? [];
  const fields = usedMetaFields(list);
  const meta = metaLabels(fields, locale);

  if (format === 'xlsx' || format === 'xlsxData') {
    const which = format === 'xlsxData' ? 'data' : 'record';
    const { inputKeys: allIn, outputKeys: allOut } = detailColumns(list);
    const keep = (requested, known) => (requested ? requested.filter((k) => known.includes(k)) : known);
    const inputKeys = which === 'data' ? keep(columns?.inputs, allIn) : allIn;
    const outputKeys = which === 'data' ? keep(columns?.outputs, allOut) : allOut;
    const rows = which === 'data'
      ? toXlsxDetailedRows(list, locale, { inputKeys, outputKeys })
      : toXlsxRows(list, locale);
    return {
      format,
      // The data sheet's own header row, minus the three meta columns the
      // detailed view prepends — those are constant and would push the field
      // names off the side of a small preview.
      columns: (rows[0] ?? []).map(String),
      total: list.length,
      rows: rows.slice(1, 1 + limit).map((r) => r.map((c) => String(cell(c)))),
    };
  }

  if (format === 'markdown') {
    // The table's columns are the five fixed ones plus whichever metadata
    // fields this set actually uses — the same `usedMetaFields` the writer
    // calls, so a previewed column cannot be missing from the file.
    return {
      format,
      columns: [...columnsFor(locale), ...meta],
      total: list.length,
      rows: list.slice(0, limit).map((e) => [
        localStamp(e?.at, locale),
        kindName(e?.kind, locale),
        e?.summary ?? '',
        flatten(e?.inputs, locale),
        flatten(e?.outputs, locale),
        ...metaValues(fields, e),
      ]),
    };
  }

  return {
    format: 'csv',
    columns: [...columnsFor(locale), ...meta],
    total: list.length,
    rows: list.slice(0, limit).map((e) => [
      localStamp(e?.at, locale),
      kindName(e?.kind, locale),
      e?.summary ?? '',
      flatten(e?.inputs, locale),
      flatten(e?.outputs, locale),
      ...metaValues(fields, e),
    ]),
  };
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
  const fields = usedMetaFields(entries);
  const rows = [[...columnsFor(locale), ...metaLabels(fields, locale)]];
  for (const e of entries ?? []) {
    rows.push([
      localStamp(e?.at, locale),
      kindName(e?.kind, locale),
      e?.summary ?? '',
      flatten(e?.inputs, locale),
      flatten(e?.outputs, locale),
      ...metaValues(fields, e),
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
function toXlsxDetailedRows(entries, locale = 'zh', only) {
  const derived = detailColumns(entries);
  const inputKeys = only?.inputKeys ?? derived.inputKeys;
  const outputKeys = only?.outputKeys ?? derived.outputKeys;
  const io = locale === 'en' ? { in: 'in', out: 'out' } : { in: '输入', out: '结果' };
  const fields = usedMetaFields(entries);
  const header = [
    ...detailMeta(locale),
    ...inputKeys.map((k) => `${fieldLabel(k, locale)}（${io.in}）`),
    ...outputKeys.map((k) => `${fieldLabel(k, locale)}（${io.out}）`),
    // Metadata last, and with no (输入)/(结果) suffix: it is neither, and a
    // suffix would invite a reader to treat it as a replayed input.
    ...metaLabels(fields, locale),
  ];
  const rows = [header];
  for (const e of entries ?? []) {
    rows.push([
      localStamp(e?.at, locale),
      kindName(e?.kind, locale),
      e?.summary ?? '',
      ...inputKeys.map((k) => cell(e?.inputs?.[k])),
      ...outputKeys.map((k) => cell(e?.outputs?.[k])),
      ...metaValues(fields, e),
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
 * The notes sheet, as rows.
 *
 * Two halves, and the split is the point. The first is identifying: what
 * software, which version, when, how many records, in what time zone, and
 * which side each field came from — a file found on its own has no other way
 * to answer those, and a spreadsheet of numbers with no statement of what they
 * are is only useful to the person who exported it, on the day they exported
 * it. The field list is generated from the same `fieldLabel` the columns use,
 * so the sheet cannot describe a column differently from how it is headed.
 *
 * The second half is substantive: **which quantities this model corrects for
 * and which it does not.** That half is why this function exists at all — the
 * earlier version had the identifying facts and a one-line "for teaching
 * only", and a spreadsheet is the artefact that leaves, pasted into a report
 * or opened six months later by
 * someone who never saw the app. The README's 「已校正的与未建模的」 section is
 * written on the principle that calling a corrected quantity "ignored" is
 * itself a false statement; the file that travels without the app should not
 * be the one place that distinction goes missing.
 *
 * ## Why it reads `DISCLAIMER_POINTS`
 *
 * The notice shown to every user on first run is the copy that gets corrected
 * — it was already corrected once, when the pH tab gained activity correction
 * and the old wording (written for the buffer tab alone) became false. A
 * second copy here would be a second thing to forget.
 */
export function toXlsxNotes(locale, count, detail = {}) {
  const zh = locale !== 'en';
  const limits = DISCLAIMER_POINTS.find((p) => p.titleEn === 'The model is simplified');
  const verify = DISCLAIMER_POINTS.find((p) => p.titleEn === 'Verify results yourself');
  const L = zh
    ? {
      title: '说明', item: '项目', value: '内容',
      fields: '字段与单位', io: '来源', in: '输入', out: '结果',
      limits: '已校正的与未建模的', verify: '核对结果', note: '说明',
    }
    : {
      title: 'Notes', item: 'Item', value: 'Value',
      fields: 'Fields and units', io: 'Side', in: 'input', out: 'output',
      limits: 'Corrected and not modelled', verify: 'Verify results', note: 'Note',
    };

  const point = (p) => [[p.titleZh && zh ? p.titleZh : p.titleEn, ''], [L.note, zh ? p.zh : p.en]];
  const fieldRows = (detail.inputKeys || detail.outputKeys)
    ? [
      [],
      [L.fields, ''],
      [zh ? '字段' : 'Field', L.io],
      ...(detail.inputKeys ?? []).map((k) => [fieldLabel(k, locale), L.in]),
      ...(detail.outputKeys ?? []).map((k) => [fieldLabel(k, locale), L.out]),
    ]
    : [];

  return [
    [L.title, ''],
    [L.item, L.value],
    [zh ? '软件' : 'Software', 'Lab Calc'],
    [zh ? '版本' : 'Version', typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''],
    ...(detail.exported ? [[zh ? '导出时间' : 'Exported', detail.exported]] : []),
    [zh ? '记录条数' : 'Records', count ?? 0],
    ...(detail.timeZone ? [[zh ? '时区' : 'Time zone', detail.timeZone]] : []),
    ...fieldRows,
    [],
    /*
     * Four sections, and the order is deliberate: what the file is for, then
     * what it does not model, then how much its numbers can be trusted, then
     * what to do about that. A reader who stops after two has the two that
     * matter most.
     */
    [zh ? '用途限制' : 'Intended use', ''],
    ...point(DISCLAIMER_POINTS.find((p) => p.titleEn === 'Educational use only')),
    [],
    ...point(DISCLAIMER_POINTS.find((p) => p.titleEn === 'Not for clinical, diagnostic, or production use')),
    [],
    [L.limits, ''],
    ...point(limits),
    [],
    [zh ? '不确定度' : 'Uncertainty', ''],
    ...point(DISCLAIMER_POINTS.find((p) => p.titleEn === 'Results carry an uncertainty')),
    [],
    [L.verify, ''],
    ...point(verify),
  ];
}

/**
 * The two shapes a spreadsheet export can take.
 *
 * `record` is one row per calculation, the five columns the CSV has, with each
 * side's fields folded into its cell. `data` is one column per field, for a
 * machine to sort and average.
 *
 * They are not two quality levels of the same thing; they answer different
 * questions, which is why neither can be removed. But only one of them can be
 * the default, and the measurement decides which. Measured through this
 * function on a three-record history (`.tmp/diag/plan-measure.mjs`):
 *
 *     record   5 columns, 156 characters total  — fits a 1920px screen (~240)
 *     data    23 columns, 529 characters total  — 289 past the edge
 *
 * And `data` grows a column for every field the app gains, while `record` stays
 * at five forever. A default that does not fit the window it opens in is the
 * complaint, verbatim.
 */
export const XLSX_VIEWS = ['record', 'data'];

/** The sheet each view writes, per locale. */
const SHEET_NAMES = {
  record: { zh: '记录', en: 'Records' },
  data: { zh: '计算结果', en: 'Results' },
};

/**
 * Everything `downloadXlsx` needs, decided and measured but not yet written.
 *
 * Split out from the download for one reason: `downloadXlsx` touches `document`
 * and lazily imports the ZIP writer, so nothing about it can be tested under
 * Node. The decision — which rows, which widths, which sheet name, which file
 * name — is the part that can be wrong in a way a reader would notice, and it
 * is pure. Keeping it here means the layout is pinned by tests instead of by
 * whoever next opens an exported file.
 *
 * `columns` narrows the `data` view: `{ inputs: [...], outputs: [...] }` of raw
 * keys. A requested key that is not in the data is dropped rather than written
 * as an empty column — an all-blank column in a spreadsheet reads as "this was
 * measured and came out missing", which is a different claim.
 */
export function xlsxPlan(entries, {
  view = 'record', columns, now = new Date(), locale = 'zh',
} = {}) {
  const zh = locale !== 'en';
  const which = XLSX_VIEWS.includes(view) ? view : 'record';
  const { inputKeys: allIn, outputKeys: allOut } = detailColumns(entries);
  const keep = (requested, known) => (requested
    ? requested.filter((k) => known.includes(k))
    : known);
  const inputKeys = which === 'data' ? keep(columns?.inputs, allIn) : allIn;
  const outputKeys = which === 'data' ? keep(columns?.outputs, allOut) : allOut;

  const rows = which === 'data'
    ? toXlsxDetailedRows(entries, locale, { inputKeys, outputKeys })
    : toXlsxRows(entries, locale);
  const notes = toXlsxNotes(locale, entries?.length ?? 0, {
    exported: localStamp(now.toISOString(), locale),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
    inputKeys,
    outputKeys,
  });

  const day = now.toISOString().slice(0, 10);
  const tag = { record: zh ? '记录' : 'records', data: zh ? '详细' : 'detailed' };
  return {
    view: which,
    rows,
    widths: widthsFor(rows),
    notes,
    noteWidths: widthsFor(notes, { min: 10, max: 60 }),
    sheetName: SHEET_NAMES[which][zh ? 'zh' : 'en'],
    noteSheetName: zh ? '说明' : 'Notes',
    filename: `lab-calc-${tag[which]}-${day}.xlsx`,
  };
}

/**
 * Download an .xlsx.
 *
 * Async, and the writer is imported inside rather than at the top of the file.
 * `xlsx.mjs` builds a ZIP of XML by hand — every part, the content types, the
 * relationships, the shared strings — and it is several hundred lines that no
 * part of opening the app needs. Imported statically it was in the first
 * download for everyone who never exports a spreadsheet, which is most people.
 *
 * The bytes go through a Blob rather than a string, so `downloadFile` takes
 * the `Uint8Array` unchanged. The MIME type is the registered one for xlsx;
 * getting it wrong makes Excel refuse the file on a double-click even though
 * the content is fine.
 *
 * Two sheets: the data, and the notes that make the data readable later. The
 * data sheet is first, because that is what the file is for.
 */
export async function downloadXlsx(entries, { view = 'record', columns, now = new Date(), locale = 'zh' } = {}) {
  const { toXlsx } = await import('./xlsx.mjs');
  const plan = xlsxPlan(entries, { view, columns, now, locale });
  const bytes = toXlsx(plan.rows, {
    sheetName: plan.sheetName,
    widths: plan.widths,
    // The notes sheet is one narrow column of prose and one of values; the
    // widths come from its own content rather than the data sheet's.
    extraSheets: [{
      name: plan.noteSheetName,
      rows: plan.notes,
      widths: plan.noteWidths,
    }],
    now,
  });
  return downloadFile(bytes, plan.filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
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

