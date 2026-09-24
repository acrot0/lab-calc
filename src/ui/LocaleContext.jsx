import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { detectLocale, loadLocale, saveLocale, makeTranslator, LOCALES } from './i18n.mjs';
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

/** Language switcher. A select rather than a toggle so adding a third locale
 *  does not require redesigning the control. */
export function LocaleSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="locale-switch">
      <span className="sr-only">{t('app.langLabel')}</span>
      <select value={locale} onChange={(e) => setLocale(e.target.value)} aria-label={t('app.langLabel')}>
        {Object.entries(LOCALES).map(([code, name]) => (
          <option key={code} value={code}>{name}</option>
        ))}
      </select>
    </label>
  );
}
