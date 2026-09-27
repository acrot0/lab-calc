import React, { useState } from 'react';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { useI18n } from '../LocaleContext.jsx';
import { META_FIELDS } from '../history.mjs';

/**
 * The per-record metadata editor: experiment, purpose, operator.
 *
 * Collapsed to a single line until asked for, and the line is the *values*
 * when they exist — a record carrying `EXP-2026-14` should show that in the
 * list without the reader opening anything. Opening reveals the fields.
 *
 * Saves on blur rather than on every keystroke. The record list is the source
 * of truth and every keystroke would rewrite the whole history in
 * localStorage — 500 records serialised per character typed. Blur is also when
 * the user has finished thinking about the field, which is when the value is
 * actually meant.
 *
 * A record with no metadata shows nothing but a small "add" affordance. It
 * must not show three empty boxes on every row: the common case is a
 * calculation someone did not need to annotate, and three empty inputs per
 * record would turn the list into a form.
 */
export default function EntryMeta({ entry, onSave }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  // Local drafts, so typing does not round-trip through the store per keystroke.
  const [draft, setDraft] = useState({});

  const meta = entry?.meta ?? {};
  const filled = META_FIELDS.filter((f) => meta[f.key]);

  function commit(key, value) {
    if ((meta[key] ?? '') === value.trim()) return;
    onSave(entry.id, { [key]: value });
  }

  if (!open) {
    return (
      <div className="entry-meta">
        {filled.length > 0 && (
          <span className="entry-meta-values">
            {filled.map((f) => (
              <span className="entry-meta-chip" key={f.key} title={f.label[locale] ?? f.label.zh}>
                {meta[f.key]}
              </span>
            ))}
          </span>
        )}
        <button
          type="button"
          className="link-btn entry-meta-toggle"
          aria-expanded={false}
          onClick={() => {
            setDraft(Object.fromEntries(META_FIELDS.map((f) => [f.key, meta[f.key] ?? ''])));
            setOpen(true);
          }}
        >
          <Icons.meta size={ICON_SIZE.inline} aria-hidden="true" />
          {filled.length > 0 ? t('history.metaEdit') : t('history.metaAdd')}
        </button>
      </div>
    );
  }

  return (
    <div className="entry-meta entry-meta-open">
      {META_FIELDS.map((f) => (
        <label className="entry-meta-field" key={f.key}>
          <span className="entry-meta-label">{f.label[locale] ?? f.label.zh}</span>
          <input
            type="text"
            value={draft[f.key] ?? ''}
            maxLength={f.maxLength}
            placeholder={f.placeholder?.[locale] ?? f.placeholder?.zh ?? ''}
            aria-label={f.label[locale] ?? f.label.zh}
            onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
            onBlur={(e) => commit(f.key, e.target.value)}
            onKeyDown={(e) => {
              // Enter commits and closes, which is what a one-line field implies.
              if (e.key === 'Enter') { commit(f.key, e.target.value); setOpen(false); }
              if (e.key === 'Escape') setOpen(false);
            }}
          />
        </label>
      ))}
      <button type="button" className="link-btn" onClick={() => setOpen(false)}>
        {t('history.metaDone')}
      </button>
    </div>
  );
}
