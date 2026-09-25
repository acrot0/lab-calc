import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo,
} from 'react';
import {
  applyDensity, loadDensity, nextDensity, saveDensity, DEFAULT_DENSITY,
} from './density.mjs';
import { useI18n } from './LocaleContext.jsx';
import { ICON_SIZE } from './icons.jsx';

const Ctx = createContext(null);

/**
 * Interface density, persisted and published on the document element.
 *
 * The fourth sibling of the theme, material and icon-style providers. It is the
 * one that needs no React at all at render time — the density is applied by
 * setting two custom properties on `<html>`, and CSS does the rest with
 * `calc()`. The provider exists to hold the choice and cycle it, not to
 * distribute a value that components read.
 */
export function DensityProvider({ store, children }) {
  const [density, setDensity] = useState(() => loadDensity(store));

  useEffect(() => {
    applyDensity(typeof document !== 'undefined' ? document.documentElement : null, density);
  }, [density]);

  useEffect(() => { if (store) saveDensity(store, density); }, [store, density]);

  const cycle = useCallback(() => setDensity((d) => nextDensity(d)), []);

  const value = useMemo(() => ({ density, setDensity, cycle }), [density, setDensity, cycle]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * The density switch.
 *
 * The icon reflects the density rather than naming it: three horizontal rules
 * with the gaps set by the current multiplier. At a glance the button shows
 * what it controls, which a fixed glyph could not.
 */
export function DensityToggle() {
  const ctx = useContext(Ctx);
  const density = ctx?.density ?? DEFAULT_DENSITY;
  const cycle = ctx?.cycle ?? (() => {});
  const { t } = useI18n();
  const gap = density === 'compact' ? 1.5 : density === 'spacious' ? 4.5 : 3;

  return (
    <button
      type="button"
      className="control"
      onClick={cycle}
      title={t('density.switch')}
    >
      <svg width={ICON_SIZE.control} height={ICON_SIZE.control} viewBox="0 0 16 16" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x="2"
            y={3 + i * (gap + 1.6)}
            width="12"
            height="1.6"
            rx="0.8"
            fill="currentColor"
          />
        ))}
      </svg>
      <span className="control-label">{t(`density.${density}`)}</span>
    </button>
  );
}
