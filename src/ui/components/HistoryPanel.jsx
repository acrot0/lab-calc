import React, { useState, useMemo, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { filterHistory, visibleEntries } from '../history.mjs';
import {
  downloadCsv, downloadMarkdown, downloadBundle, downloadXlsx, parseBundle,
  detailColumns,
} from '../export.mjs';
import EntryMeta from './EntryMeta.jsx';
import ColumnPicker from './ColumnPicker.jsx';
import { useI18n } from '../LocaleContext.jsx';
import { recordSummary } from '../summaries.mjs';
import { ArtEmptyHistory, ArtEmptySearch } from './Illustrations.jsx';

/*
 * The print report is loaded on demand.
 *
 * It is a sibling of the app, rendered into `document.body` and hidden by the
 * print stylesheet until the browser prints. Nothing about the first screen
 * needs it, and it drags in the formula registry, the method descriptions and
 * the signature block — a few hundred lines of markup that were downloaded and
 * parsed on every visit to show nothing.
 *
 * Loaded when the panel first mounts rather than at print time, because a
 * print dialog does not wait for a network fetch: by the time the chunk
 * arrived the page would already have been sent to the printer, blank.
 */
const Report = lazy(() => import('./Report.jsx'));

export default function HistoryPanel({
  entries, allEntries, deleted = [], onRemove, onRestore, onReplay, onClear, onImport, onMeta,
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const fileRef = useRef(null);
  // Which fields the data view carries. `null` means all of them — see the
  // note on ColumnPicker for why "everything" is the honest default.
  const [columns, setColumns] = useState(null);
  const [colsOpen, setColsOpen] = useState(false);
  /*
   * Deleted records never reach the list, search or not.
   *
   * `filterHistory` returns its input unchanged for an empty query, so without
   * this the deleted records would show up in the list whenever the search box
   * was empty — which is most of the time. Belt and braces with the caller
   * passing `visibleEntries`, because this component is also mounted directly
   * by tests and by any future caller that hands it the raw list.
   */
  const live = useMemo(() => visibleEntries(entries), [entries]);
  const shown = useMemo(() => filterHistory(live, query), [live, query]);
  // What the data view could offer, computed from the records actually being
  // exported rather than from the whole history — the picker must not offer a
  // column the file will not contain.
  const available = useMemo(() => detailColumns(shown), [shown]);

  // Export what is currently visible, not the whole history — after a search,
  // "export" plainly means "export these results".
  function doExport(format) {
    setMenuOpen(false);
    // Summaries are derived at export time so the file matches the UI language
    // the user is looking at, rather than whatever language wrote the record.
    const rows = shown.map((e) => ({ ...e, summary: recordSummary(e, t) }));
    if (format === 'csv') downloadCsv(rows, locale);
    // The backup is the archive, deleted records included. Excluding them
    // would make "export a backup, then delete the app data" lose the very
    // records the audit trail exists to keep.
    else if (format === 'json') downloadBundle(allEntries ?? entries);
    else if (format === 'xlsx' || format === 'xlsxData') {
      // Async because the .xlsx writer is fetched on demand — see the note on
      // `downloadXlsx`. A failure here is a fetch that did not arrive, which is
      // worth telling the user rather than swallowing.
      //
      // Two menu items, one call: the views are the same sheet written two
      // ways, and the only thing the menu decides is which. Record is listed
      // first because it is the one that fits on screen — see `xlsxPlan`.
      const view = format === 'xlsxData' ? 'data' : 'record';
      downloadXlsx(rows, { locale, view, columns: columns ?? undefined })
        .catch(() => setNotice({ kind: 'err', text: t('history.exportFailed') }));
    } else downloadMarkdown(rows, locale);
  }

  /*
   * "Export PDF" is the browser's print dialog.
   *
   * The report is already in the DOM, hidden on screen; the print stylesheet
   * reveals it and hides the app. So this does not build a document — it asks
   * the browser to print the one that is already there, which is why the
   * output is vector text rather than a rasterised canvas.
   *
   * `requestAnimationFrame` is not ceremony: the report renders from the same
   * `shown` array this handler reads, and on the first click React may not
   * have committed it yet. Waiting one frame guarantees the document being
   * printed is the one the user is looking at.
   */
  function printReport() {
    setMenuOpen(false);
    requestAnimationFrame(() => globalThis.print?.());
  }

  /*
   * Importing reads the whole history, not the filtered view.
   *
   * Export is scoped to what is on screen because "export these results" is
   * what a search implies; import has no such reading — a backup file is the
   * whole history, and silently dropping the rows that did not match a stale
   * search box would be data loss with no warning.
   */
  async function doImport(file) {
    if (!file) return;
    const result = parseBundle(await file.text());
    const source = allEntries ?? entries;
    if (!result.ok) {
      setNotice({ kind: 'err', text: t(`history.importErr_${result.code}`) });
    } else if (result.entries.length === 0) {
      setNotice({ kind: 'err', text: t('history.importErr_empty') });
    } else {
      const before = source.length;
      onImport(result.entries);
      // The count reported is what the merge actually kept, not what the file
      // held — otherwise importing the same file twice claims new records.
      const dup = before + result.entries.length - new Set(
        [...source, ...result.entries].map((e) => e.id),
      ).size;
      const key = dup > 0 ? 'history.importDup' : 'history.importOk';
      const extra = result.dropped > 0 ? t('history.importDropped', { dropped: result.dropped }) : '';
      setNotice({ kind: 'ok', text: t(key, { n: result.entries.length - dup, dup }) + extra });
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="card">
      <div className="history-head">
        <h2>
          <Icons.history size={ICON_SIZE.inline} style={{ verticalAlign: '-2px', marginRight: 6 }} aria-hidden="true" />
          {t('history.title')}
        </h2>
        {(allEntries ?? entries).length > 0 && (
          <div className="head-actions">
            <div className="export-wrap">
              <button
                className="link-btn"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <Icons.download size={ICON_SIZE.inline} style={{ verticalAlign: '-1px', marginRight: 3 }} aria-hidden="true" />
                {t('history.export')}
              </button>
              {menuOpen && (
                <div className="export-menu" role="menu">
                  <button role="menuitem" onClick={() => doExport('csv')}>
                    <Icons.csv size={ICON_SIZE.inline} aria-hidden="true" /> {t('history.exportCsv')}
                  </button>
                  <button role="menuitem" onClick={() => doExport('markdown')}>
                    <Icons.markdown size={ICON_SIZE.inline} aria-hidden="true" /> {t('history.exportMarkdown')}
                  </button>
                  <button role="menuitem" onClick={() => doExport('xlsx')}>
                    <Icons.csv size={ICON_SIZE.inline} aria-hidden="true" /> {t('history.exportXlsxRecord')}
                  </button>
                  <button role="menuitem" onClick={() => doExport('xlsxData')}>
                    <Icons.csv size={ICON_SIZE.inline} aria-hidden="true" /> {t('history.exportXlsxData')}
                  </button>
                  {/* Opens a picker rather than exporting: choosing columns is
                      a step before the export, not a kind of export. */}
                  <button role="menuitem" onClick={() => { setMenuOpen(false); setColsOpen((v) => !v); }}>
                    <Icons.meta size={ICON_SIZE.inline} aria-hidden="true" /> {t('history.colPicker')}
                  </button>
                  <button role="menuitem" onClick={() => doExport('json')}>
                    <Icons.json size={ICON_SIZE.inline} aria-hidden="true" /> {t('history.exportJson')}
                  </button>
                  <button role="menuitem" onClick={() => printReport()}>
                    <Icons.markdown size={ICON_SIZE.inline} aria-hidden="true" /> {t('history.exportPdf')}
                  </button>
                </div>
              )}
            </div>
            <button className="link-btn" onClick={() => fileRef.current?.click()}>
              <Icons.upload size={ICON_SIZE.inline} style={{ verticalAlign: '-1px', marginRight: 3 }} aria-hidden="true" />
              {t('history.import')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label={t('history.import')}
              onChange={(e) => doImport(e.target.files?.[0])}
            />
            {/* Disabled when there is nothing left to clear: the button marks
                records rather than erasing them, so with an empty live list it
                would silently do nothing and look broken. */}
            <button
              className="link-btn"
              onClick={onClear}
              disabled={live.length === 0}
            >
              {t('history.clearAll')}
            </button>
          </div>
        )}
      </div>

      {colsOpen && (
        <div className="col-picker-wrap">
          <ColumnPicker available={available} selected={columns} onChange={setColumns} />
          <button type="button" className="link-btn" onClick={() => setColsOpen(false)}>
            {t('history.metaDone')}
          </button>
        </div>
      )}

      {notice && (
        <div className={`notice notice-${notice.kind}`} role="status">
          {notice.text}
          <button className="link-btn" onClick={() => setNotice(null)} aria-label={t('history.dismiss')}>×</button>
        </div>
      )}

      {live.length > 0 && (
        <div className="search">
          <Icons.search size={ICON_SIZE.inline} aria-hidden="true" />
          <label className="sr-only" htmlFor="hist-search">{t('history.search')}</label>
          <input
            id="hist-search"
            type="search"
            placeholder={t('history.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {live.length === 0 ? (
        <div className="empty">
          <ArtEmptyHistory />
          {t('history.empty')}<br />
          {t('history.emptyHint1')}<br />
          {t('history.emptyHint2')}
        </div>
      ) : shown.length === 0 ? (
        <div className="empty">
          <ArtEmptySearch />
          {t('history.noMatch', { query })}
        </div>
      ) : (
        <div className="history-list">
          {shown.map((e) => {
            const summary = recordSummary(e, t);
            return (
              <div className="history-item" key={e.id}>
                <div className="body">
                  <div className="summary">{summary}</div>
                  <div className="when">{new Date(e.at).toLocaleString()}</div>
                  {onMeta && <EntryMeta entry={e} onSave={onMeta} />}
                </div>
                <button
                  className="icon-btn"
                  title={t('history.replay')}
                  aria-label={`${t('history.replay')}: ${summary}`}
                  onClick={() => onReplay(e)}
                >
                  <Icons.replay size={ICON_SIZE.inline} aria-hidden="true" />
                </button>
                <button
                  className="icon-btn"
                  title={t('history.remove')}
                  aria-label={`${t('history.remove')}: ${summary}`}
                  onClick={() => onRemove(e.id)}
                >
                  <Icons.remove size={ICON_SIZE.inline} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/*
        The way back.
        Deleting marks rather than erases, but a mark nobody can reach is the
        same as an erasure from where the user is standing. This section is the
        only thing that makes the audit trail true rather than merely stored.
      */}
      {deleted.length > 0 && (
        <div className="trash">
          <button
            className="link-btn"
            onClick={() => setTrashOpen((v) => !v)}
            aria-expanded={trashOpen}
          >
            <Icons.remove size={ICON_SIZE.inline} style={{ verticalAlign: '-1px', marginRight: 3 }} aria-hidden="true" />
            {trashOpen ? t('history.trashHide') : t('history.trashShow', { n: deleted.length })}
          </button>
          {trashOpen && (
            <div className="trash-body">
              <p className="trash-hint">{t('history.trashHint')}</p>
              <div className="history-list">
                {deleted.map((e) => {
                  const summary = recordSummary(e, t);
                  return (
                    <div className="history-item is-deleted" key={e.id}>
                      <div className="body">
                        <div className="summary">{summary}</div>
                        <div className="when">
                          {t('history.deletedAt', { at: new Date(e.deletedAt).toLocaleString() })}
                        </div>
                      </div>
                      <button
                        className="icon-btn"
                        title={t('history.restore')}
                        aria-label={`${t('history.restore')}: ${summary}`}
                        onClick={() => onRestore(e.id)}
                      >
                        <Icons.replay size={ICON_SIZE.inline} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
              {/* Bulk restore, because "clear all" is a bulk action and its
                  undo has to be one too — otherwise recovering 200 records is
                  200 clicks, which is a different thing from an undo. */}
              {deleted.length > 1 && (
                <button
                  className="link-btn"
                  onClick={() => {
                    deleted.forEach((e) => onRestore(e.id));
                    setNotice({ kind: 'ok', text: t('history.restored', { n: deleted.length }) });
                  }}
                >
                  {t('history.restoreAll')}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/*
        Print-only, and portalled to <body> rather than rendered here.
        The print stylesheet hides `.app`, and this panel is inside `.app` —
        so rendering the report in place meant the rule that reveals the report
        and the rule that hides the app cancelled out, and the printed page was
        blank. It has to be a sibling of the app, not a descendant.
      */}
      {/*
        The Suspense boundary is not decoration.
        `Report` is `lazy`, and this portal has no boundary above it — React
        bubbles a suspended child up to the nearest one, and there is none, so
        the *entire app* unmounts to its fallback while the chunk downloads.
        On a cold load that is a blank page; in a test it is an empty container
        with nothing logged, which is how it was found. `null` is the right
        fallback: the report is print-only and invisible on screen, so there is
        nothing to show while it is absent.
      */}
      {typeof document !== 'undefined' && createPortal(
        <Suspense fallback={null}>
          <Report entries={shown.map((e) => ({ ...e, summary: recordSummary(e, t) }))} />
        </Suspense>,
        document.body,
      )}
    </div>
  );
}
