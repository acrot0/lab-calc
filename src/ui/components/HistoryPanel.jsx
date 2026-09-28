import React, { useState, useMemo, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { filterHistory, visibleEntries, replayInputs } from '../history.mjs';
import { filterByGroup, groupCounts, ungroupedCount, ALL_GROUPS } from '../groups.mjs';
import GroupPicker from './GroupPicker.jsx';
import {
  downloadCsv, downloadMarkdown, downloadBundle, downloadXlsx, parseBundle,
  detailColumns, exportPreview,
} from '../export.mjs';
import EntryMeta from './EntryMeta.jsx';
import ColumnPicker from './ColumnPicker.jsx';
import { useI18n } from '../LocaleContext.jsx';
import { useUndo } from '../use-undo.mjs';
import { recordSummary } from '../summaries.mjs';
import { SCALE_FACTORS, scaleKind, preservedKeys } from '../scale-inputs.mjs';
import { fieldLabel } from '../field-labels.mjs';
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

/**
 * The batch-scale control: a button that opens the list of factors.
 *
 * A menu rather than five inline buttons because the row already carries
 * replay and delete, and five more targets beside them would turn a record
 * into a toolbar. The menu is also where the one thing a user has to
 * understand about scaling can be said — that the concentration does not
 * change — which is a sentence, not a button label.
 */
function ScaleMenu({ entry, summary, onScale }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const preserved = preservedKeys(replayInputs(entry));
  return (
    <span className="scale-wrap">
      <button
        type="button"
        className="icon-btn"
        title={t('history.scaleHint')}
        aria-label={`${t('history.scale')}: ${summary}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <Icons.scale size={ICON_SIZE.inline} aria-hidden="true" />
      </button>
      {open && (
        <div className="scale-menu" role="menu">
          <div className="scale-menu-hint">{t('history.scaleHint')}</div>
          {SCALE_FACTORS.map((factor) => (
            <button
              key={factor}
              type="button"
              role="menuitem"
              className="scale-menu-item"
              onClick={() => { setOpen(false); onScale(entry, factor); }}
            >
              {t('history.scaleFactor', { factor })}
            </button>
          ))}
          {/*
            Naming the fields that will not move. A control labelled ×2 that
            leaves a visible field unchanged reads as broken unless the reason
            is on screen — and the reason is a real property of the chemistry,
            not a limitation.
          */}
          {preserved.length > 0 && (
            <div className="scale-menu-kept">
              {t('history.scaleKept', { fields: preserved.map((k) => fieldLabel(k, locale)).join('、') })}
            </div>
          )}
        </div>
      )}
    </span>
  );
}

export default function HistoryPanel({
  entries, allEntries, deleted = [], groups = [],
  onRemove, onRestore, onReplay, onClear, onImport, onMeta, onScale,
  onCreateGroup, onRenameGroup, onDeleteGroup, onGroupNote, onSetRecordGroup,
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [trashOpen, setTrashOpen] = useState(false);
  // Which group the list is filtered to. `all` rather than null so the control
  // has a value to render on first paint.
  const [groupFilter, setGroupFilter] = useState(ALL_GROUPS);
  const fileRef = useRef(null);
  // Which fields the data view carries. `null` means all of them — see the
  // note on ColumnPicker for why "everything" is the honest default.
  const [columns, setColumns] = useState(null);
  const [colsOpen, setColsOpen] = useState(false);
  /*
   * The export awaiting confirmation, or null.
   *
   * Export used to fire straight from the menu: the file appeared in the
   * downloads bar and the only way to see what was in it was to open it. With
   * a search active and a column subset chosen, the two things most likely to
   * be wrong — which rows, which columns — are both invisible at the moment of
   * the click. This holds the format so the preview can show them first.
   */
  const [preview, setPreview] = useState(null);
  /*
   * The immediate undo, as distinct from the trash section below.
   *
   * The complaint was that a mis-tap cleared everything. Nothing was actually
   * destroyed — the records were marked, and the trash could bring any of them
   * back — but the recovery was invisible at the moment of the mistake: the
   * list went empty and the explanation was below the fold. This bar names what
   * happened and offers the way back for as long as it is on screen. The trash
   * stays; that is the durable undo, this is the immediate one.
   */
  const undo = useUndo();
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
  /*
   * The group filter is applied before the search, not after.
   *
   * The counts on the chips are of the whole group, so a search that narrowed
   * the list while the counts stayed at the group total would be two different
   * numbers on screen for the same thing. Filtering first keeps the count and
   * the list describing the same set.
   */
  const inGroup = useMemo(() => filterByGroup(live, groupFilter), [live, groupFilter]);
  const shown = useMemo(() => filterHistory(inGroup, query), [inGroup, query]);
  const counts = useMemo(() => groupCounts(live), [live]);
  const ungrouped = useMemo(() => ungroupedCount(live), [live]);
  // What the data view could offer, computed from the records actually being
  // exported rather than from the whole history — the picker must not offer a
  // column the file will not contain.
  const available = useMemo(() => detailColumns(shown), [shown]);

  /*
   * The rows the next export would contain.
   *
   * Summaries are derived at export time so the file matches the UI language
   * the user is looking at, rather than whatever language wrote the record.
   * `shown` rather than the whole history: after a search, "export" plainly
   * means "export these results".
   */
  const exportRows = useMemo(
    () => shown.map((e) => ({ ...e, summary: recordSummary(e, t) })),
    [shown, t],
  );

  /*
   * Show what the export would contain, instead of downloading it.
   *
   * The JSON bundle is excluded on purpose. It is the whole archive, deleted
   * records included, and its shape is not tabular — a three-row preview of a
   * file whose point is being complete would misrepresent it rather than
   * inform anyone. It keeps downloading directly from the menu.
   */
  function openPreview(format) {
    setMenuOpen(false);
    setPreview({
      format,
      plan: exportPreview(exportRows, {
        format,
        locale,
        view: format === 'xlsxData' ? 'data' : 'record',
        columns: columns ?? undefined,
      }),
    });
  }

  // Export what is currently visible, not the whole history.
  function doExport(format) {
    setMenuOpen(false);
    const rows = exportRows;
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
                  <button role="menuitem" onClick={() => openPreview('csv')}>
                    <Icons.csv size={ICON_SIZE.inline} aria-hidden="true" /> {t('history.exportCsv')}
                  </button>
                  <button role="menuitem" onClick={() => openPreview('markdown')}>
                    <Icons.markdown size={ICON_SIZE.inline} aria-hidden="true" /> {t('history.exportMarkdown')}
                  </button>
                  <button role="menuitem" onClick={() => openPreview('xlsx')}>
                    <Icons.csv size={ICON_SIZE.inline} aria-hidden="true" /> {t('history.exportXlsxRecord')}
                  </button>
                  <button role="menuitem" onClick={() => openPreview('xlsxData')}>
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
              onClick={() => {
                /*
                 * The ids are captured *before* the clear, and the count is
                 * read from the same list the user is looking at.
                 *
                 * Deriving them at undo time cannot work: `allEntries` is a
                 * prop, so the closure sees the list as it was when the bar was
                 * created — before the clear marked anything — and the filter
                 * would find no tombstones and restore nothing. The bar would
                 * appear, the button would work, and it would do nothing.
                 *
                 * Capturing also states the intent exactly: undo the clear
                 * means put back these records, the ones that were on screen
                 * when it happened. A record taken to the trash a minute
                 * earlier is not part of this action and must stay gone.
                 */
                const ids = live.map((e) => e.id);
                onClear();
                undo.offer(
                  t('history.undoCleared', { n: ids.length }),
                  // Bulk, because clearing was bulk. Restoring only the first
                  // would read as a partial undo, which is indistinguishable
                  // from data loss.
                  () => ids.forEach((id) => onRestore(id)),
                );
              }}
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

      {/* What the next download would contain, shown before it happens. */}
      {preview && (
        <div className="export-preview" role="region" aria-label={t('history.previewTitle')}>
          <div className="export-preview-head">
            <strong>{t('history.previewTitle')}</strong>
            <span className="export-preview-count">
              {t('history.previewCount', { n: preview.plan.total })}
            </span>
          </div>
          <div className="export-preview-cols">
            {preview.plan.columns.map((c, i) => (
              <span className="export-preview-col" key={`${c}-${i}`}>{c}</span>
            ))}
          </div>
          {preview.plan.rows.length > 0 && (
            <div className="export-preview-table">
              <table>
                <tbody>
                  {preview.plan.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cellText, cIdx) => (
                        <td key={cIdx} title={cellText}>{cellText}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview.plan.total > preview.plan.rows.length && (
            <p className="hint">{t('history.previewMore', { n: preview.plan.total - preview.plan.rows.length })}</p>
          )}
          <div className="export-preview-actions">
            <button type="button" className="primary" onClick={() => { doExport(preview.format); setPreview(null); }}>
              {t('history.previewConfirm')}
            </button>
            <button type="button" className="link-btn" onClick={() => setPreview(null)}>
              {t('history.previewCancel')}
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div className={`notice notice-${notice.kind}`} role="status">
          {notice.text}
          <button className="link-btn" onClick={() => setNotice(null)} aria-label={t('history.dismiss')}>×</button>
        </div>
      )}

      {/*
        The immediate undo.
        A separate shape from the notice above it, because it is a different
        thing: a notice reports, this one is the way back. It is also the only
        thing on screen after a "clear all", which is exactly when the user
        needs it to be unmistakable.
      */}
      {undo.pending && (
        <div className="undo-bar" role="status" aria-live="polite">
          <Icons.replay size={ICON_SIZE.inline} aria-hidden="true" />
          <span className="undo-text">{undo.pending.text}</span>
          <button type="button" className="undo-run" onClick={undo.run}>
            {t('history.undo')}
          </button>
          <button
            type="button" className="undo-close" onClick={undo.dismiss}
            aria-label={t('history.dismiss')}
          >
            <Icons.close size={ICON_SIZE.inline} aria-hidden="true" />
          </button>
        </div>
      )}

      {onCreateGroup && groups.length + ungrouped > 0 && (
        <GroupPicker
          groups={groups}
          counts={counts}
          ungrouped={ungrouped}
          value={groupFilter}
          onChange={setGroupFilter}
          onCreate={onCreateGroup}
          onRename={onRenameGroup}
          onDelete={onDeleteGroup}
        />
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
          {/*
            Three different empties, three different sentences. "No match for
            X" is wrong when the search box is empty and the group is the
            reason nothing is showing — and it is the state a user hits right
            after making a group.
          */}
          {query.trim() !== ''
            ? t('history.noMatch', { query })
            : t('history.groupEmpty')}
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
                  {onMeta && (
                    <EntryMeta
                      entry={e} onSave={onMeta}
                      groups={groups} onGroupChange={onSetRecordGroup}
                    />
                  )}
                </div>
                <button
                  className="icon-btn"
                  title={t('history.replay')}
                  aria-label={`${t('history.replay')}: ${summary}`}
                  onClick={() => onReplay(e)}
                >
                  <Icons.replay size={ICON_SIZE.inline} aria-hidden="true" />
                </button>
                {/*
                  Batch scaling, on the records it means something for.

                  Gated on `scaleKind`, which reads the same recipe registry the
                  procedure steps use: a kind that has bench steps is one a
                  person makes with their hands, and those are exactly the ones
                  another batch size is meaningful for. A Nernst potential is a
                  property of a cell, so it gets no button rather than a button
                  that produces a meaningless record.
                */}
                {onScale && scaleKind(e.kind) && (
                  <ScaleMenu entry={e} summary={summary} onScale={onScale} />
                )}
                <button
                  className="icon-btn"
                  title={t('history.remove')}
                  aria-label={`${t('history.remove')}: ${summary}`}
                  onClick={() => {
                    onRemove(e.id);
                    // One record at a time, so the message names it rather than
                    // counting. "Undo" with no object is the version of this
                    // that gets clicked wrongly a second time.
                    undo.offer(t('history.undoRemoved'), () => onRestore(e.id));
                  }}
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
