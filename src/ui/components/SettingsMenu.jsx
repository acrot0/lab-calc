import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { useI18n } from '../LocaleContext.jsx';
import { ThemePicker, labelOf, useTheme } from '../ThemeContext.jsx';
import { IconStyleToggle } from '../IconStyleContext.jsx';
import { DensityToggle } from '../DensityContext.jsx';
import { LocaleSelect } from './LocaleSelect.jsx';
import { SHORTCUTS } from '../shortcuts.mjs';

/**
 * The four preference controls, behind one button.
 *
 * ## Why they were moved off the bar
 *
 * They are settings, and they sat in the topbar at the same weight as the
 * calculator button — which is a tool the user reaches for constantly. A row of
 * four dropdowns that change once a session crowds out the one control that is
 * used every minute, and on a 390px phone the four of them took the entire
 * second line of the header before wrapping.
 *
 * ## Why a popover and not a page
 *
 * Four controls do not need a screen, and a settings screen would be a place
 * the user has to come back from. The popover closes on an outside click or
 * Escape, like every other overlay here.
 *
 * ## Why the controls themselves are unchanged
 *
 * The theme picker, the icon style, the density and the language each already
 * had their own behaviour, their own persistence and their own labels. This
 * groups them; it does not reimplement them. The theme picker is the one that
 * had to change shape — it opened its own menu, and a menu inside a menu is a
 * thing to get wrong — so it renders flat here.
 */
export default function SettingsMenu({ open, onOpenChange }) {
  const { t } = useI18n();
  const [selfOpen, setSelfOpen] = useState(false);
  // Closed by default: see the note on the theme block below.
  const [themeOpen, setThemeOpen] = useState(false);
  const { preference, resolved } = useTheme();
  const { locale } = useI18n();
  // "System" is shown as itself rather than as the palette it currently means:
  // the setting the user chose is "follow the system", and showing the concrete
  // colour would make the choice look like it had changed on its own.
  const themeLabel = labelOf(preference, locale);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  // The panel is a portal, so it is not inside `wrapRef` and a containment test
  // against the wrap alone treats every click on a control as an outside click.
  const panelRef = useRef(null);

  /*
   * Controlled when the parent passes a flag, self-managed otherwise.
   *
   * The parent needs to control it because `?` opens this panel from anywhere —
   * a shortcut that can only open a panel it does not own would have to reach
   * into the component. The fallback keeps the component usable on its own,
   * which is what a test that renders it in isolation needs.
   */
  const isControlled = onOpenChange !== undefined;
  const openState = isControlled ? open : selfOpen;
  const setOpen = isControlled ? onOpenChange : setSelfOpen;

  /*
   * Where to put the panel on a wide screen.
   *
   * As a portal it is positioned against the viewport, so the button's own
   * coordinates have to be read — a `right: 0` relative to the topbar is no
   * longer available. Measured on open rather than on every render: the button
   * does not move while the panel is up, and re-reading it on scroll would be
   * work for nothing.
   *
   * Below the phone breakpoint the CSS ignores this and pins the panel to the
   * bottom of the screen, where a sheet belongs.
   */
  const [anchor, setAnchor] = useState(null);
  useEffect(() => {
    if (!openState) { setAnchor(null); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setAnchor({ top: r.bottom + 6, right: Math.max(8, globalThis.innerWidth - r.right) });
  }, [openState]);

  /*
   * Close on an outside press, not on any press that misses the button.
   *
   * The panel lives in a portal, so it is a sibling of `wrapRef`, not a child.
   * Testing containment against the wrap alone therefore classified every press
   * *inside* the panel as an outside press: `mousedown` fired first and closed
   * the panel, so the `click` that follows landed on a removed node and no
   * control ever responded. The panel was reachable only for the instant
   * between opening it and touching it.
   *
   * Listening on `mousedown` in the capture phase and testing both refs is what
   * makes the distinction the intent always was: the button toggles, the panel
   * keeps its own clicks, and anything else dismisses.
   */
  useEffect(() => {
    if (!openState) return undefined;
    const onDown = (e) => {
      const target = e.target;
      if (wrapRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [openState, setOpen]);

  return (
    <div className="settings-wrap" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={`control${openState ? ' is-on' : ''}`}
        onClick={() => setOpen(!openState)}
        aria-expanded={openState}
        aria-haspopup="dialog"
        title={t('app.settings')}
      >
        <Icons.settings size={ICON_SIZE.control} aria-hidden="true" />
        <span className="control-label">{t('app.settings')}</span>
      </button>

      {/*
        Rendered into `document.body`, not inside the topbar.

        `.topbar` has a `z-index`, which creates a stacking context — so a panel
        inside it is painted entirely within the topbar's layer, and no
        `z-index` on the panel itself can lift it above the phone's bottom
        navigation. Measured: the last row of the shortcut list was hit-tested
        as `BUTTON.mobile-nav-item`, i.e. the bar was painting over the sheet.

        As a portal the panel is a sibling of the topbar, where its own
        `z-index` is what decides. The click-outside check has to test the panel
        as well as the wrap for that reason — see the effect above.
      */}
      {openState && createPortal(
        <div
          ref={panelRef}
          className="settings-menu"
          role="dialog"
          aria-label={t('app.settings')}
          style={anchor ? { top: anchor.top, right: anchor.right } : undefined}
        >
          <div className="settings-row">
            <span className="settings-label">{t('app.setLang')}</span>
            <LocaleSelect />
          </div>
          <div className="settings-row">
            <span className="settings-label">{t('app.setIcons')}</span>
            <IconStyleToggle />
          </div>
          <div className="settings-row">
            <span className="settings-label">{t('app.setDensity')}</span>
            <DensityToggle />
          </div>
          <p className="settings-note">{t('app.densityNote')}</p>

          {/*
            The theme list, behind a disclosure.

            Eleven themes is most of the panel's height, and left open it pushed
            the shortcut list below the fold — so a user opening the settings to
            read the shortcuts had to scroll past a list of colours they did not
            come for. Closed, the panel fits without scrolling and every setting
            is visible at once; the current theme is on the button, so the
            closed state still says what is chosen.
          */}
          <div className="settings-block">
            <button
              type="button"
              className="settings-block-toggle"
              aria-expanded={themeOpen}
              onClick={() => setThemeOpen((v) => !v)}
            >
              <span className="settings-label">{t('app.setTheme')}</span>
              <span className="settings-current">{themeLabel}</span>
              <Icons.caret size={ICON_SIZE.inline} className="caret" aria-hidden="true" />
            </button>
            {themeOpen && <ThemePicker />}
          </div>

          {/*
            The shortcut list.

            Here rather than in a help screen of its own: the settings popover
            is already the place a user goes to find out what the app can do,
            and a list of six keys does not need a screen. Reading it from
            `shortcuts.mjs` is what keeps it honest — the same table the handler
            matches against, so a shortcut that stops working disappears from
            the list at the same time.
          */}
          <div className="settings-shortcuts">
            <div className="settings-shortcuts-head">
              <Icons.shortcuts size={ICON_SIZE.inline} aria-hidden="true" />
              {t('app.shortcuts')}
            </div>
            <ul>
              {SHORTCUTS.map(({ action, keys, label }) => (
                <li key={action}>
                  <span className="settings-keys">
                    {keys.map((k) => <kbd key={k}>{k}</kbd>)}
                  </span>
                  <span className="settings-action">{t(label)}</span>
                </li>
              ))}
              {/* Escape is handled by each layer rather than by the dispatcher,
                  so it is listed here without being in the table above. */}
              <li>
                <span className="settings-keys"><kbd>Esc</kbd></span>
                <span className="settings-action">{t('app.scClose')}</span>
              </li>
            </ul>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
