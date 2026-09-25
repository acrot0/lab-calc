import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { filterHistory } from '../history.mjs';
import {
  downloadCsv, downloadMarkdown, downloadBundle, downloadXlsx, parseBundle,
} from '../export.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { recordSummary } from '../summaries.mjs';
import { ArtEmptyHistory, ArtEmptySearch } from './Illustrations.jsx';
import Report from './Report.jsx';

export default function HistoryPanel({ entries, onRemove, onReplay, onClear, onImport }) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const fileRef = useRef(null);
  const shown = useMemo(() => filterHistory(entries, query), [entries, query]);

  // Export what is currently visible, not the whole history — after a search,
  // "export" plainly means "export these results".
  function doExport(format) {
    setMenuOpen(false);
    // Summaries are derived at export time so the file matches the UI language
    // the user is looking at, rather than whatever language wrote the record.
    const rows = shown.map((e) => ({ ...e, summary: recordSummary(e, t) }));
    if (format === 'csv') downloadCsv(rows, locale);
    else if (format === 'json') downloadBundle(entries);
    else if (format === 'xlsx') downloadXlsx(rows, { locale });
    else downloadMarkdown(rows, locale);
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
    if (!result.ok) {
      setNotice({ kind: 'err', text: t(`history.importErr_${result.code}`) });
    } else if (result.entries.length === 0) {
      setNotice({ kind: 'err', text: t('history.importErr_empty') });
    } else {
      const before = entries.length;
      onImport(result.entries);
      // The count reported is what the merge actually kept, not what the file
      // held — otherwise importing the same file twice claims new records.
      const dup = before + result.entries.length - new Set(
        [...entries, ...result.entries].map((e) => e.id),
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
        {entries.length > 0 && (
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
                    <Icons.csv size={ICON_SIZE.inline} aria-hidden="true" /> {t('history.exportXlsx')}
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
            <button className="link-btn" onClick={onClear}>{t('history.clearAll')}</button>
          </div>
        )}
      </div>

      {notice && (
        <div className={`notice notice-${notice.kind}`} role="status">
          {notice.text}
          <button className="link-btn" onClick={() => setNotice(null)} aria-label={t('history.dismiss')}>×</button>
        </div>
      )}

      {entries.length > 0 && (
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

      {entries.length === 0 ? (
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
        Print-only, and portalled to <body> rather than rendered here.
        The print stylesheet hides `.app`, and this panel is inside `.app` —
        so rendering the report in place meant the rule that reveals the report
        and the rule that hides the app cancelled out, and the printed page was
        blank. It has to be a sibling of the app, not a descendant.
      */}
      {typeof document !== 'undefined' && createPortal(
        <Report entries={shown.map((e) => ({ ...e, summary: recordSummary(e, t) }))} />,
        document.body,
      )}
    </div>
  );
}
