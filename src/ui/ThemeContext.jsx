import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo, useRef,
} from 'react';
import {
  detectTheme, resolveTheme, loadTheme, saveTheme, nextTheme, applyTheme, chromeColor,
  THEMES, THEME_GROUPS,
} from './theme.mjs';
import { PALETTES } from './palettes.mjs';
import { useI18n } from './LocaleContext.jsx';

const Ctx = createContext(null);

const prefersDark = () => (
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : undefined
);

export function ThemeProvider({ store, children }) {
  const [preference, setPreference] = useState(() => detectTheme(prefersDark(), store ? loadTheme(store) : null));
  const [osDark, setOsDark] = useState(prefersDark);

  // Follow the OS live: a user on "system" who flips their OS theme at dusk
  // should not have to reload the page.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setOsDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved = resolveTheme(preference, osDark);

  useEffect(() => {
    applyTheme(
      typeof document !== 'undefined' ? document.documentElement : null,
      resolved,
      preference,
    );
    // The browser paints the mobile status bar from this tag, so leaving it at
    // the build-time default gives a Catppuccin theme a blue-black chrome.
    if (typeof document !== 'undefined') {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', chromeColor(resolved));
    }
  }, [resolved, preference]);

  useEffect(() => { if (store) saveTheme(store, preference); }, [store, preference]);

  const cycle = useCallback(() => setPreference((p) => nextTheme(p)), []);

  const value = useMemo(() => ({
    preference, resolved, setPreference, cycle, themes: THEMES,
  }), [preference, resolved, cycle]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme must be used inside a ThemeProvider');
  return v;
}

/** The label for a theme key in the current locale. */
export function labelOf(key, locale) {
  const t = THEMES[key];
  return t ? (locale === 'zh' ? t.zh : t.en) : key;
}

/**
 * A swatch showing a palette's own colours.
 *
 * Three bars — background, surface and accent — drawn from the palette
 * registry rather than from the active theme, so the menu shows what each
 * option *is* before it is chosen. A list of names alone asks the reader to
 * remember what "Catppuccin Mocha" looks like.
 */
function Swatch({ themeKey }) {
  const p = PALETTES[themeKey];
  if (!p) return <span className="swatch swatch-system" aria-hidden="true" />;
  const { tokens } = p;
  return (
    <span className="swatch" aria-hidden="true" style={{ background: tokens.bg }}>
      <span className="swatch-bar" style={{ background: tokens.surface3 }} />
      <span className="swatch-bar" style={{ background: tokens.accent }} />
    </span>
  );
}

/**
 * The theme list, rendered flat.
 *
 * The same list the menu shows, without the menu. It exists because the theme
 * picker now lives inside the settings popover, and a menu that opens a menu is
 * a thing to get wrong — the inner one has to close the outer one on an outside
 * click, and the two compete for the same Escape key. Flat, there is one
 * overlay and one Escape.
 *
 * Grouped by scheme, which is the distinction that matters most: a user looking
 * for a light theme should not have to read the dark ones to find it.
 */
export function ThemePicker() {
  const { preference, resolved, setPreference } = useTheme();
  const { locale, t } = useI18n();

  return (
    <>
      {THEME_GROUPS.map((group) => (
        <div className="theme-group" key={group.id}>
          <div className="theme-group-label">{t(`theme.group_${group.id}`)}</div>
          {group.keys.map((key) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={preference === key}
              className={`theme-item${preference === key ? ' is-on' : ''}`}
              key={key}
              onClick={() => setPreference(key)}
            >
              <Swatch themeKey={key === 'system' ? resolved : key} />
              <span className="theme-name">{labelOf(key, locale)}</span>
              {PALETTES[key]?.credit && (
                <span className="theme-credit">{PALETTES[key].credit}</span>
              )}
            </button>
          ))}
        </div>
      ))}
    </>
  );
}

/**
 * The theme picker as a button that opens a menu.
 *
 * A menu rather than a cycling button. Cycling was right when there were three
 * states; with seven it means up to six clicks to reach the one you want, and
 * no way to see what the options are.
 *
 * Kept as its own component even though the topbar now uses the settings
 * popover: this is the shape for a place with room for a control of its own,
 * and the flat list above is the shape for inside a panel.
 */
export function ThemeToggle() {
  const { preference, resolved, setPreference } = useTheme();
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Close on an outside click or Escape. Without this the menu stays open
  // behind the next interaction and looks like a stuck panel.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = labelOf(preference, locale);

  return (
    <div className="theme-wrap" ref={wrapRef}>
      <button
        type="button"
        className="control"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={t('theme.pick')}
      >
        <Swatch themeKey={resolved} />
        <span className="control-label">{current}</span>
      </button>

      {open && (
        <div className="theme-menu" role="menu">
          {THEME_GROUPS.map((group) => (
            <div className="theme-group" key={group.id}>
              <div className="theme-group-label">{t(`theme.group_${group.id}`)}</div>
              {group.keys.map((key) => (
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={preference === key}
                  className={`theme-item${preference === key ? ' is-on' : ''}`}
                  key={key}
                  onClick={() => { setPreference(key); setOpen(false); }}
                >
                  <Swatch themeKey={key === 'system' ? resolved : key} />
                  <span className="theme-name">{labelOf(key, locale)}</span>
                  {PALETTES[key]?.credit && (
                    <span className="theme-credit">{PALETTES[key].credit}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
