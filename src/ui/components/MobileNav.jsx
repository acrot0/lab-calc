import React, { useState, useEffect, useRef } from 'react';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { useI18n } from '../LocaleContext.jsx';
import { useNavOrder } from '../NavOrderContext.jsx';
import { resolveTabs } from '../nav-order.mjs';

/**
 * The phone's navigation: a bottom bar of five, and a sheet for the rest.
 *
 * ## Why the bar is at the bottom
 *
 * The bottom third of a phone screen is where a thumb rests; the top corners
 * are the hardest to reach one-handed. Both Material 3 and iOS put primary
 * navigation at the bottom for that reason, and the previous layout — a
 * horizontal tab row under the header — put sixteen items in the hardest place
 * to reach and wrapped onto three lines at 390px.
 *
 * ## Why five and not sixteen
 *
 * Both platform guidelines specify 3–5 destinations. At 390px, sixteen items
 * would be 24px each, under the 44px touch floor; five gives 78px each. The
 * other eleven live in the sheet, which is what the guidelines say to do with
 * them. See `nav-order.mjs`.
 *
 * ## Why the sheet is a sheet and not a menu
 *
 * Eleven items with icons and labels do not fit in a dropdown, and a dropdown
 * anchored to the rightmost item would run off the right edge. A bottom sheet
 * is full width, scrolls, and is the pattern both platforms use for exactly
 * this.
 *
 * ## Why both the bar and the sheet are always in the DOM
 *
 * The desktop rail is hidden by a media query rather than by React measuring
 * the viewport, for the same reason: a JS breakpoint misses a resize, and this
 * app is installed as a PWA where a rotate is a resize. CSS decides.
 */
export default function MobileNav({ tabs, current, onSelect, onEditNav }) {
  const { t } = useI18n();
  const { order, size } = useNavOrder();

  /*
   * The nav's label for a tab: a short name where one exists, the tab's own
   * title otherwise.
   *
   * A column here is 53px, which at 11.5px holds about four CJK characters.
   * `元素周期表` is five and wrapped, so the bar showed five one-line labels
   * beside one two-line one. The fallback is the absence of a `tabsShort` key,
   * which `t` returns as the key itself.
   */
  function navLabel(id) {
    const short = t(`tabsShort.${id}`);
    return short === `tabsShort.${id}` ? t(`tabs.${id}`) : short;
  }
  const [open, setOpen] = useState(false);
  const sheetRef = useRef(null);

  /*
   * The bar is the head of the user's order; the sheet is the rest.
   *
   * `resolveTabs` drops any id that no longer names a tab, so nothing can
   * render an undefined icon — and every tab lands in exactly one of the two,
   * because the provider reconciled the order against the live list.
   */
  const { bar: primary, more: secondary } = resolveTabs(tabs, order, size);
  // The sheet's button is highlighted when the current tab is inside it —
  // otherwise selecting a tab from the sheet would leave the bar looking like
  // nothing is selected.
  const currentIsSecondary = !primary.some((tab) => tab.id === current);

  // Escape closes the sheet, which is what every overlay in this app does.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // A tap anywhere outside closes it. On the scrim rather than on the document,
  // so a tap on a tab does not also register as an outside tap and fight the
  // selection.
  function choose(id) {
    onSelect(id);
    setOpen(false);
  }

  return (
    <>
      {open && (
        <div
          className="nav-sheet-scrim"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            ref={sheetRef}
            className="nav-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t('app.moreTabs')}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="nav-sheet-head">
              <h2>{t('app.moreTabs')}</h2>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setOpen(false)}
                aria-label={t('convert.calcClose')}
              >
                <Icons.close size={ICON_SIZE.control} aria-hidden="true" />
              </button>
            </div>
            <div className="nav-sheet-grid">
              {secondary.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  className="nav-sheet-item"
                  aria-current={current === id ? 'page' : undefined}
                  onClick={() => choose(id)}
                >
                  <Icon size={ICON_SIZE.display} aria-hidden="true" />
                  <span>{navLabel(id)}</span>
                </button>
              ))}
            </div>

            {/*
              The edit entry point.

              At the foot of the sheet, after every destination, because the
              sheet is where a user goes to find something that is not in the
              bar — and "I want this one in the bar" is the next thought after
              finding it. It closes the sheet first so the editor is not stacked
              on top of it.
            */}
            <button
              type="button"
              className="nav-sheet-edit"
              onClick={() => { setOpen(false); onEditNav?.(); }}
            >
              <Icons.drag size={ICON_SIZE.control} aria-hidden="true" />
              <span>{t('app.editNav')}</span>
            </button>
          </div>
        </div>
      )}

      <nav className="mobile-nav" aria-label={t('app.navLabel')}>
        {primary.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className="mobile-nav-item"
            aria-current={current === id ? 'page' : undefined}
            onClick={() => choose(id)}
          >
            <Icon size={ICON_SIZE.display} aria-hidden="true" />
            <span>{navLabel(id)}</span>
          </button>
        ))}
        <button
          type="button"
          className={`mobile-nav-item${currentIsSecondary || open ? ' is-current' : ''}`}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <Icons.more size={ICON_SIZE.display} aria-hidden="true" />
          <span>{t('app.more')}</span>
        </button>
      </nav>
    </>
  );
}
