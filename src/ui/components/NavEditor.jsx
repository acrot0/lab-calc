import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { useI18n } from '../LocaleContext.jsx';
import { useNavOrder } from '../NavOrderContext.jsx';
import { BAR_SIZE, MIN_BAR, resolveTabs } from '../nav-order.mjs';
import { useDragReorder } from '../use-drag-reorder.mjs';

/**
 * The editor for the tab order.
 *
 * ## What it does and what it does not
 *
 * Two decisions, both reversible: which tabs the phone bar holds — expressed as
 * "how many", since the bar is the head of the order — and what that order is.
 * There is deliberately no renaming and no hiding. A renamed tab would be
 * untranslatable, and a hidden one would be unreachable, which is the opposite
 * of what a user asking for this wants: the point is that every function is
 * still reachable, just with the ones they use in front.
 *
 * ## Why the bar size is a separate control
 *
 * Because the bar is the *head* of the order, "which tabs" and "in what order"
 * are the same list — moving a tab into the bar and moving it to the front are
 * one gesture. Making the count explicit is what keeps the two from being
 * confusing: the user sets how many slots there are, then arranges what fills
 * them, and the divider shows where the bar ends.
 *
 * ## Why the rail is not editable here
 *
 * It is the same order. The hint says so, because a user who only ever sees the
 * phone will otherwise not know their arrangement reaches the desktop.
 */
export default function NavEditor({ tabs, onClose }) {
  const { t } = useI18n();
  const { order, size, move, setSize, reset } = useNavOrder();
  const [announce, setAnnounce] = useState('');
  const [resetDone, setResetDone] = useState(false);

  // The order as tab entries, so the list renders icons and labels without the
  // caller having to pass a lookup. The editor shows every tab, so it takes
  // `all` rather than the bar/more split.
  const items = useMemo(() => resolveTabs(tabs, order).all, [tabs, order]);

  const {
    listRef, dragIndex, target, held, listHandlers, dragHandle, keyHandler,
  } = useDragReorder(order, move);

  /*
   * Announce the move, not the state.
   *
   * A screen reader reads a live region when its text changes. Repeating the
   * same sentence after a move in the same direction would be silent — the text
   * did not change — so the position is included, which makes every move a new
   * sentence.
   */
  useEffect(() => {
    if (held == null) return;
    const tab = items[held];
    if (!tab) return;
    setAnnounce(t('app.navMoved', { name: t(`tabs.${tab.id}`), n: held + 1, total: items.length }));
  }, [held, items, t]);

  // Escape closes the editor, matching every other overlay in the app. It is
  // registered here rather than on the sheet so it does not fight the drag
  // hook's own Escape, which restores a held item — the drag hook stops
  // propagation only while something is held.
  const heldRef = useRef(held);
  heldRef.current = held;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && heldRef.current == null) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const current = t('app.editNav');

  return (
    <div
      className="nav-sheet-scrim nav-editor-scrim"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="nav-sheet nav-editor"
        role="dialog"
        aria-modal="true"
        aria-label={current}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="nav-sheet-head">
          <h2>{current}</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label={t('app.navDone')}
          >
            <Icons.close size={ICON_SIZE.control} aria-hidden="true" />
          </button>
        </div>

        <p className="nav-editor-hint">{t('app.editNavHint')}</p>

        {/*
          How many tabs the bar holds. A stepper rather than a slider: the range
          is three values wide, and a slider over three values is a worse
          control than two buttons — every position is a target, and there is no
          precision to trade for.
        */}
        <div className="nav-editor-size">
          <span className="nav-editor-size-label">{t('app.navBarSize')}</span>
          <div className="nav-editor-stepper" role="group" aria-label={t('app.navBarSize')}>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setSize(size - 1)}
              disabled={size <= MIN_BAR}
              aria-label={t('app.navBarSize') + ' −'}
            >
              <Icons.subtract size={ICON_SIZE.control} aria-hidden="true" />
            </button>
            <output className="nav-editor-size-value">
              {t('app.navBarSizeValue', { n: size })}
            </output>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setSize(size + 1)}
              disabled={size >= BAR_SIZE}
              aria-label={t('app.navBarSize') + ' +'}
            >
              <Icons.add size={ICON_SIZE.control} aria-hidden="true" />
            </button>
          </div>
        </div>
        <p className="nav-editor-note">{t('app.navBarSizeNote')}</p>

        <ul className="nav-editor-list" ref={listRef} {...listHandlers}>
          {items.map((tab, i) => {
            const Icon = tab.icon;
            const inBar = i < size;
            const isDragged = dragIndex === i;
            const isTarget = target === i && dragIndex != null;
            return (
              <li
                key={tab.id}
                data-reorder-item
                // The id as well as the key: the key is React's, and a test
                // asserting which tab is where should read the tab's own name
                // rather than its position in a list React reorders.
                data-id={tab.id}
                className={[
                  'nav-editor-item',
                  inBar ? 'is-in-bar' : '',
                  isDragged ? 'is-dragging' : '',
                  isTarget ? 'is-target' : '',
                  held === i ? 'is-held' : '',
                  // The divider marks the boundary between the bar and More.
                  // Drawn on the item *after* the last bar slot, so it stays
                  // put when the size changes.
                  i === size && size < items.length ? 'is-boundary' : '',
                ].filter(Boolean).join(' ')}
                aria-grabbed={held === i ? true : undefined}
              >
                <button
                  type="button"
                  className="nav-editor-grip"
                  aria-label={t('app.navDragHandle')}
                  onPointerDown={dragHandle(i)}
                  onKeyDown={keyHandler(i)}
                >
                  <Icons.drag size={ICON_SIZE.control} aria-hidden="true" />
                </button>
                <span className="nav-editor-icon" aria-hidden="true">
                  <Icon size={ICON_SIZE.display} />
                </span>
                <span className="nav-editor-name">{t(`tabs.${tab.id}`)}</span>
                <span className="nav-editor-slot" aria-hidden="true">
                  {inBar ? i + 1 : ''}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="nav-editor-actions">
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              reset();
              setResetDone(true);
            }}
          >
            {t('app.navReset')}
          </button>
          {resetDone && <span className="nav-editor-done">{t('app.navResetDone')}</span>}
        </div>

        {/*
          The live region is always mounted: a region that appears at the same
          time as its text is not reliably announced, because the screen reader
          may not have been observing it yet.
        */}
        <p className="sr-only" role="status" aria-live="polite">{announce}</p>
      </div>
    </div>
  );
}