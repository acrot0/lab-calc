import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  detectTheme, resolveTheme, loadTheme, saveTheme, nextTheme, applyTheme, THEMES,
} from './theme.mjs';
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
    applyTheme(typeof document !== 'undefined' ? document.documentElement : null, resolved);
  }, [resolved]);

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

/** Cycles dark → light → system. Shows the current mode's name. */
export function ThemeToggle() {
  const { preference, cycle } = useTheme();
  const { locale } = useI18n();
  const theme = THEMES[preference] ?? THEMES.dark;
  const label = locale === 'zh' ? theme.zh : theme.en;

  return (
    <button className="control" onClick={cycle} title={label} aria-label={label}>
      {preference === 'dark' && <MoonIcon />}
      {preference === 'light' && <SunIcon />}
      {preference === 'system' && <MonitorIcon />}
      <span className="control-label">{label}</span>
    </button>
  );
}

/* Inline SVGs rather than a lucide import: these three are used once and the
   stroke weights need to match each other exactly across the set. */
const iconProps = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

const MoonIcon = () => <svg {...iconProps}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>;
const SunIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4" />
  </svg>
);
const MonitorIcon = () => (
  <svg {...iconProps}>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);
