/**
 * Translation layer.
 *
 * Deliberately minimal — no library, no build step. The whole app has a few
 * hundred strings; a dependency would be more machinery than the problem.
 *
 * `t()` takes a key and optional params, and falls back to the key itself when
 * a translation is missing. Falling back to the key rather than throwing means
 * a missing string shows up as an obvious placeholder in the UI instead of
 * blanking a panel.
 */

export const LOCALES = {
  zh: '中文',
  en: 'English',
};

export const DEFAULT_LOCALE = 'zh';

const STORAGE_KEY = 'lab-calc.locale.v1';

/**
 * Which locale to start in.
 *
 * A stored preference wins. Otherwise match the browser's language, so an
 * English-speaking visitor does not land on a Chinese UI and have to hunt for
 * a toggle. Anything not starting with `zh` gets English, since English is the
 * broader default for a chemistry tool.
 */
export function detectLocale(navigatorLang, stored) {
  if (stored && stored in LOCALES) return stored;
  const lang = String(navigatorLang ?? '').toLowerCase();
  if (lang.startsWith('zh')) return 'zh';
  if (lang.length === 0) return DEFAULT_LOCALE;
  return 'en';
}

export function loadLocale(store) {
  try {
    return store?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveLocale(store, locale) {
  try {
    store?.setItem(STORAGE_KEY, locale);
    return true;
  } catch {
    return false;
  }
}

export function localeStoreKey() {
  return STORAGE_KEY;
}

/**
 * Resolve a dotted key against a nested dictionary.
 *
 *   lookup(zh, 'tabs.weigh') -> '称量配制'
 */
export function lookup(dict, key) {
  let cur = dict;
  for (const part of String(key).split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/**
 * Build a translator bound to one dictionary.
 *
 * Params are substituted as `{name}`. A param that is missing from the call
 * leaves the placeholder in place rather than rendering `undefined` — the
 * former is visibly wrong, the latter reads like data.
 */
export function makeTranslator(dict, fallbackDict = {}) {
  return function t(key, params) {
    let s = lookup(dict, key) ?? lookup(fallbackDict, key) ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        s = s.replaceAll(`{${k}}`, String(v));
      }
    }
    return s;
  };
}
