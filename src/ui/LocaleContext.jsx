import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { detectLocale, loadLocale, saveLocale, makeTranslator } from './i18n.mjs';
import { zh } from './locales/zh.mjs';
import { en } from './locales/en.mjs';

const DICTS = { zh, en };

const Ctx = createContext(null);

export function LocaleProvider({ store, children }) {
  const [locale, setLocale] = useState(() => detectLocale(
    typeof navigator !== 'undefined' ? navigator.language : '',
    store ? loadLocale(store) : null,
  ));

  useEffect(() => { if (store) saveLocale(store, locale); }, [store, locale]);

  // index.html ships lang="zh-CN", so switching to English left the document
  // claiming to be Chinese. A screen reader picks its pronunciation from this
  // attribute, which means English text was being read with Chinese phonetics.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }, [locale]);

  // `t` falls back to Chinese for any key English is missing, so a gap in the
  // translation degrades to a readable string rather than a raw key.
  const value = useMemo(() => ({
    locale,
    setLocale,
    t: makeTranslator(DICTS[locale] ?? zh, zh),
    dict: DICTS[locale] ?? zh,
  }), [locale]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n must be used inside a LocaleProvider');
  return v;
}

