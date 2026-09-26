import React from 'react';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { useI18n } from '../LocaleContext.jsx';
import { LOCALES } from '../i18n.mjs';

/**
 * The language picker.
 *
 * Its own component because it is used in two places — the topbar and the
 * settings popover — and a `<select>` duplicated in two files is two places for
 * the label association to drift.
 *
 * A named export rather than a default: the file exports exactly one thing, and
 * a default plus a named would be two ways to import the same component.
 */
export function LocaleSelect() {
  const { locale, setLocale, t } = useI18n();
  return (
    <span className="control-group">
      <Icons.language size={ICON_SIZE.inline} aria-hidden="true" />
      <label className="sr-only" htmlFor="locale-select">{t('app.langLabel')}</label>
      <select
        id="locale-select"
        className="control"
        value={locale}
        onChange={(e) => setLocale(e.target.value)}
      >
        {Object.entries(LOCALES).map(([code, name]) => (
          <option key={code} value={code}>{name}</option>
        ))}
      </select>
    </span>
  );
}
