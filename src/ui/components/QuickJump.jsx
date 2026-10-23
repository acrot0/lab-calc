import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { useI18n } from '../LocaleContext.jsx';
import { useNavOrder } from '../NavOrderContext.jsx';
import { searchQuickJump, moveSelection } from '../quick-jump.mjs';

/**
 * The quick-jump palette: one box that searches every tab and every saved
 * calculation.
 *
 * Rendered as a centred modal rather than a dropdown because it is reachable
 * from the keyboard alone (`Ctrl+P`) and must be the one thing in focus while
 * it is open — a dropdown anchored to the topbar would drag the eye across
 * the screen for something that is fundamentally a command, not a navigation
 * menu.
 *
 * ## The two lists
 *
 * Tabs first, history below. A tab is a destination; a record is a
 * destination *plus* a replay. Selecting a record runs the same `replay` path
 * the history panel uses, so the palette is not a second implementation of
 * restoration — it is a second doorway into the one that exists.
 */
export default function QuickJump({ open, onClose, tabs, current, entries, onGoTo, onReplay }) {
  const { t } = useI18n();
  const { order } = useNavOrder();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  /*
   * The palette's tab list follows the user's own nav order — the same order
   * they curated in the bar editor — so the empty query shows their tools,
   * not the developer's default ordering.
   */
  const orderedTabs = useMemo(() => {
    const byId = new Map(tabs.map((tab) => [tab.id, tab]));
    const seen = new Set();
    const out = [];
    for (const id of order) {
      const tab = byId.get(id);
      if (tab && !seen.has(id)) { out.push(tab); seen.add(id); }
    }
    for (const tab of tabs) {
      if (!seen.has(tab.id)) { out.push(tab); seen.add(tab.id); }
    }
    return out;
  }, [tabs, order]);

  const results = useMemo(
    () => searchQuickJump(orderedTabs, entries, query, t),
    [orderedTabs, entries, query, t],
  );

  const rows = useMemo(() => [
    ...results.tabs.map((r) => ({ kind: 'tab', ...r })),
    ...results.history.map((r) => ({ kind: 'history', ...r })),
  ], [results]);

  /*
   * Every change of the query resets the cursor to the first row: a cursor
   * left where it was points at a row that may no longer exist, and pointing
   * at nothing is how Enter comes to do the wrong thing silently.
   */
  useEffect(() => { setSelected(0); }, [query]);

  // Focus the box on open, and clear it so the palette opens ready for a new
  // query rather than showing the last one. Both happen in the same effect
  // because they are one gesture: the palette opening.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Keep the highlighted row in view when the cursor moves past the list's
  // edge. `scrollIntoView({ block: 'nearest' })` moves the list the minimum
  // needed, so it does not jump when the cursor is already visible.
  useEffect(() => {
    listRef.current
      ?.querySelectorAll('[data-qj-index]')
      // jsdom does not implement `scrollIntoView`; guard rather than stub, so
      // the component itself is honest in any environment.
      ?.[selected]?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);

  if (!open) return null;

  function choose(row) {
    if (!row) return;
    if (row.kind === 'tab') onGoTo(row.id);
    else onReplay(row.entry);
    onClose();
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((i) => moveSelection(i, 1, rows.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((i) => moveSelection(i, -1, rows.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(rows[selected]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  const listId = 'quick-jump-list';

  return (
    <div
      className="scrim"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="quick-jump"
        role="dialog"
        aria-modal="true"
        aria-label={t('quickJump.title')}
      >
        <div className="quick-jump-input">
          <Icons.search size={ICON_SIZE.inline} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            placeholder={t('quickJump.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd>Esc</kbd>
        </div>

        <div
          ref={listRef}
          className="quick-jump-list"
          id={listId}
          role="listbox"
          aria-label={t('quickJump.results', { n: rows.length })}
        >
          {results.tabs.length > 0 && (
            <div className="quick-jump-group" role="presentation">{t('quickJump.tabsGroup')}</div>
          )}
          {results.tabs.map((r, i) => {
            const TabIcon = tabs.find((tab) => tab.id === r.id)?.icon;
            return (
              <button
                type="button"
                key={r.id}
                role="option"
                aria-selected={selected === i}
                data-qj-index={i}
                className={`quick-jump-item${selected === i ? ' is-selected' : ''}`}
                onMouseEnter={() => setSelected(i)}
                onClick={() => choose(rows[i])}
              >
                {TabIcon && <TabIcon size={ICON_SIZE.inline} aria-hidden="true" />}
                <span className="quick-jump-label">{t(`tabs.${r.id}`)}</span>
                {r.id === current && (
                  <span className="quick-jump-now">{t('quickJump.current')}</span>
                )}
              </button>
            );
          })}

          {results.history.length > 0 && (
            <div className="quick-jump-group" role="presentation">{t('quickJump.historyGroup')}</div>
          )}
          {results.history.map((r, j) => {
            const i = results.tabs.length + j;
            return (
              <button
                type="button"
                key={r.id}
                role="option"
                aria-selected={selected === i}
                data-qj-index={i}
                className={`quick-jump-item${selected === i ? ' is-selected' : ''}`}
                onMouseEnter={() => setSelected(i)}
                onClick={() => choose(rows[i])}
              >
                <Icons.history size={ICON_SIZE.inline} aria-hidden="true" />
                <span className="quick-jump-label">{r.summary}</span>
              </button>
            );
          })}

          {rows.length === 0 && (
            <div className="quick-jump-empty">{t('quickJump.noMatch', { query })}</div>
          )}
        </div>

        <div className="quick-jump-foot" role="presentation">
          <span><kbd>↑</kbd><kbd>↓</kbd> {t('quickJump.navigate')}</span>
          <span><kbd>↵</kbd> {t('quickJump.open')}</span>
        </div>
      </div>
    </div>
  );
}
