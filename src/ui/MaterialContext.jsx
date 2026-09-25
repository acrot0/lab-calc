import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo,
} from 'react';
import {
  applyMaterial, loadMaterial, nextMaterial, prefersSolid, saveMaterial,
} from './material.mjs';
import { useI18n } from './LocaleContext.jsx';
import { Icons, ICON_SIZE } from './icons.jsx';

const Ctx = createContext(null);

/**
 * Material state, persisted and published on the document element.
 *
 * A sibling of ThemeProvider rather than part of it: the material is a separate
 * preference with its own key, and folding it in would mean a material change
 * re-rendered every theme consumer and vice versa.
 */
export function MaterialProvider({ store, children }) {
  const [chosen, setChosen] = useState(() => loadMaterial(store));
  const [systemSolid, setSystemSolid] = useState(prefersSolid);

  // Follow the OS "reduce transparency" switch live, so a user who turns it on
  // does not have to reload to stop seeing through the panels.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    let mq;
    try {
      mq = window.matchMedia('(prefers-reduced-transparency: reduce)');
    } catch {
      return undefined;
    }
    const onChange = (e) => setSystemSolid(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // The OS preference only ever forces solid; it cannot force frosted, because
  // a user who has asked for less transparency should not be given more of it
  // by an app that thinks it knows better.
  const material = systemSolid ? 'solid' : chosen;

  useEffect(() => { applyMaterial(typeof document !== 'undefined' ? document.documentElement : null, material); }, [material]);
  useEffect(() => { if (store) saveMaterial(store, chosen); }, [store, chosen]);

  const cycle = useCallback(() => setChosen((m) => nextMaterial(m)), []);
  const setMaterial = useCallback((m) => setChosen(m), []);

  const value = useMemo(() => ({
    material, chosen, setMaterial, cycle, systemSolid,
  }), [material, chosen, setMaterial, cycle, systemSolid]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMaterial() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMaterial must be used inside a MaterialProvider');
  return v;
}

/**
 * The material switch.
 *
 * A plain toggle rather than a menu: there are two materials, so a menu would
 * be a list of two with one already chosen — more clicks to express one bit.
 * The label names the material in effect, not the one a click would select,
 * which is the convention the theme toggle beside it already set.
 */
export function MaterialToggle() {
  const { material, cycle } = useMaterial();
  const { t } = useI18n();
  const Icon = material === 'frosted' ? Icons.frosted : Icons.solid;

  return (
    <button
      type="button"
      className="control"
      onClick={cycle}
      aria-pressed={material === 'frosted'}
      title={t('material.switch')}
    >
      <Icon size={ICON_SIZE.control} aria-hidden="true" />
      <span className="control-label">{t(`material.${material}`)}</span>
    </button>
  );
}
