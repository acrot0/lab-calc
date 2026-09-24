import React, { useState, useMemo } from 'react';
import { History, Search, Trash2, RotateCcw, Download, FileSpreadsheet, FileText } from 'lucide-react';
import { filterHistory } from '../history.mjs';
import { downloadCsv, downloadMarkdown } from '../export.mjs';
import { useI18n } from '../LocaleContext.jsx';
import { recordSummary } from '../summaries.mjs';
import { ArtEmptyHistory, ArtEmptySearch } from './Illustrations.jsx';

export default function HistoryPanel({ entries, onRemove, onReplay, onClear }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const shown = useMemo(() => filterHistory(entries, query), [entries, query]);

  // Export what is currently visible, not the whole history — after a search,
  // "export" plainly means "export these results".
  function doExport(format) {
    setMenuOpen(false);
    // Summaries are derived at export time so the file matches the UI language
    // the user is looking at, rather than whatever language wrote the record.
    const rows = shown.map((e) => ({ ...e, summary: recordSummary(e, t) }));
    if (format === 'csv') downloadCsv(rows);
    else downloadMarkdown(rows);
  }

  return (
    <div className="card">
      <div className="history-head">
        <h2>
          <History size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} aria-hidden="true" />
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
                <Download size={12} style={{ verticalAlign: '-1px', marginRight: 3 }} aria-hidden="true" />
                {t('history.export')}
              </button>
              {menuOpen && (
                <div className="export-menu" role="menu">
                  <button role="menuitem" onClick={() => doExport('csv')}>
                    <FileSpreadsheet size={13} aria-hidden="true" /> {t('history.exportCsv')}
                  </button>
                  <button role="menuitem" onClick={() => doExport('markdown')}>
                    <FileText size={13} aria-hidden="true" /> {t('history.exportMarkdown')}
                  </button>
                </div>
              )}
            </div>
            <button className="link-btn" onClick={onClear}>{t('history.clearAll')}</button>
          </div>
        )}
      </div>

      {entries.length > 0 && (
        <div className="search">
          <Search size={14} aria-hidden="true" />
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
                  <RotateCcw size={14} aria-hidden="true" />
                </button>
                <button
                  className="icon-btn"
                  title={t('history.remove')}
                  aria-label={`${t('history.remove')}: ${summary}`}
                  onClick={() => onRemove(e.id)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
