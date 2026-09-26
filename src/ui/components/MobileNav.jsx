import React, { useState, useEffect, useRef } from 'react';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { useI18n } from '../LocaleContext.jsx';
import { isPrimary, primaryTabs, secondaryTabs } from '../nav.mjs';

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
 * them. See `nav.mjs`.
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
export default function MobileNav({ tabs, current, onSelect }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const sheetRef = useRef(null);

  const primary = primaryTabs(tabs);
  const secondary = secondaryTabs(tabs);
  // The sheet's button is highlighted when the current tab is one of the eleven
  // inside it — otherwise selecting a tab from the sheet would leave the bar
  // looking like nothing is selected.
  const currentIsSecondary = !isPrimary(current);

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
                  <span>{t(`tabs.${id}`)}</span>
                </button>
              ))}
            </div>
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
            <span>{t(`tabs.${id}`)}</span>
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
