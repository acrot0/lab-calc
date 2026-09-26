import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { applyMaterial, prefersSolid } from './material.mjs';

const Ctx = createContext(null);

/**
 * Surface material, decided by the operating system and nothing else.
 *
 * ## Why there is no toggle
 *
 * There used to be one, cycling frosted and solid. On a machine with "reduce
 * transparency" switched on it was permanently disabled — the OS forces solid,
 * and it should: a user who has asked for less transparency must not be given
 * more of it by an app that thinks it knows better. But a control that is
 * always greyed out and always does nothing is indistinguishable from a broken
 * button, and it was reported as one.
 *
 * The honest fix is not a better disabled state. It is to stop offering a
 * choice that the OS has already made. The preference is real, it is just not
 * this app's to set, so the app now reads it and applies it — and there is no
 * button to be confused by.
 *
 * The provider stays because the OS preference has to be followed *live*: a
 * user who flips the switch should see the panels change without reloading.
 */
export function MaterialProvider({ children }) {
  const [systemSolid, setSystemSolid] = useState(prefersSolid);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    let mq;
    try {
      mq = window.matchMedia('(prefers-reduced-transparency: reduce)');
    } catch {
      // An unsupported query must not switch everyone to solid.
      return undefined;
    }
    const onChange = (e) => setSystemSolid(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  /*
   * The OS preference only ever forces solid; it can never force frosted. So
   * frosted is the default and solid is the override, which is also why the
   * attribute is written on every change rather than only when solid.
   */
  const material = systemSolid ? 'solid' : 'frosted';

  useEffect(() => {
    applyMaterial(typeof document !== 'undefined' ? document.documentElement : null, material);
  }, [material]);

  const value = useMemo(() => ({ material, systemSolid }), [material, systemSolid]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMaterial() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMaterial must be used inside a MaterialProvider');
  return v;
}
