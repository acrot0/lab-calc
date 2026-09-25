import React, {
  useContext, useState, useEffect, useCallback, useMemo,
} from 'react';
import {
  applyIconStyle, loadIconStyle, nextIconStyle, saveIconStyle, STYLE_WEIGHT,
} from './icon-style.mjs';
import { useI18n } from './LocaleContext.jsx';
import { Icons, ICON_SIZE } from './icons.jsx';
import { IconStyleCtx, useIconStyleName } from './icon-style-context.mjs';

/**
 * Icon style, persisted and published on the document element.
 *
 * The third sibling of ThemeProvider and MaterialProvider, for the same reason
 * those are siblings: it is an independent preference with its own storage key,
 * and folding it into either would re-render every consumer of that one when
 * this one changed.
 *
 * The chosen weight is also exposed as `weight`, because the components need it
 * as a prop rather than as CSS — Phosphor's weights are separate SVG variants,
 * not a stroke-width a stylesheet can set. The `data-icon-style` attribute on
 * the document element is for the few places that do style icons in CSS (the
 * nav rail's active state, for instance).
 */
export function IconStyleProvider({ store, children }) {
  const [style, setStyle] = useState(() => loadIconStyle(store));

  useEffect(() => {
    applyIconStyle(typeof document !== 'undefined' ? document.documentElement : null, style);
  }, [style]);

  useEffect(() => { if (store) saveIconStyle(store, style); }, [store, style]);

  const cycle = useCallback(() => setStyle((s) => nextIconStyle(s)), []);

  const value = useMemo(() => ({
    style,
    weight: STYLE_WEIGHT[style],
    setStyle,
    cycle,
  }), [style, setStyle, cycle]);

  return <IconStyleCtx.Provider value={value}>{children}</IconStyleCtx.Provider>;
}

/**
 * The icon-style switch.
 *
 * A cycling button rather than a menu, matching the material toggle beside it:
 * three options is few enough that a click-through is faster than opening a
 * list, and the label names the style in effect.
 *
 * The icon shows the *current* style's weight rather than a fixed glyph, so the
 * button is its own preview — the thing the user is choosing is the thing they
 * are looking at.
 */
export function IconStyleToggle() {
  const ctx = useContext(IconStyleCtx);
  const style = useIconStyleName();
  const cycle = ctx?.cycle ?? (() => {});
  const weight = STYLE_WEIGHT[style];
  const { t } = useI18n();

  return (
    <button
      type="button"
      className="control"
      onClick={cycle}
      title={t('iconStyle.switch')}
    >
      <Icons.icons size={ICON_SIZE.control} weight={weight} aria-hidden="true" />
      <span className="control-label">{t(`iconStyle.${style}`)}</span>
    </button>
  );
}
