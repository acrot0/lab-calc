import React, { useState } from 'react';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { useI18n } from '../LocaleContext.jsx';
import { useFields } from '../FieldsContext.jsx';
import { activeFields, labelOf } from '../field-template.mjs';

/**
 * The per-record metadata editor.
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
 *
 * ## Why the field list comes from context
 *
 * It used to be the `META_FIELDS` constant, which meant a user could not add a
 * field. The list is now whatever the template in force says, and it changes
 * while the app is running — the settings panel edits it and every record on
 * screen has to follow. A hook is what makes that a re-render rather than a
 * stale closure.
 */
export default function EntryMeta({ entry, onSave, groups = [], onGroupChange }) {
  const { t, locale } = useI18n();
  const { fields } = useFields();
  const [open, setOpen] = useState(false);
  // Local drafts, so typing does not round-trip through the store per keystroke.
  const [draft, setDraft] = useState({});

  const active = activeFields(fields);
  const meta = entry?.meta ?? {};
  /*
   * Values are shown for every key the record carries, not only for the fields
   * still being asked for. A record annotated before a field was retired keeps
   * its value, and hiding it would make the record look like it lost data.
   */
  const onRecord = Object.keys(meta).filter((k) => meta[k]);
  const shown = onRecord;
  const fieldByKey = (key) => fields.find((f) => f.key === key) ?? { key, label: { zh: key, en: key } };
  // The group is shown on the collapsed line as well: "which experiment was
  // this" is the question the feature exists to answer, and answering it only
  // after a click would leave the list as unreadable as it was before.
  const group = groups.find((g) => g.id === entry?.groupId) ?? null;

  function commit(key, value) {
    if ((meta[key] ?? '') === value.trim()) return;
    onSave(entry.id, { [key]: value });
  }

  if (!open) {
    return (
      <div className="entry-meta">
        {group && (
          <span className="entry-meta-chip entry-meta-group" title={group.note || undefined}>
            <Icons.group size={ICON_SIZE.inline} aria-hidden="true" />
            {group.name}
          </span>
        )}
        {shown.length > 0 && (
          <span className="entry-meta-values">
            {shown.map((key) => (
              <span className="entry-meta-chip" key={key} title={labelOf(fieldByKey(key), locale)}>
                {meta[key]}
              </span>
            ))}
          </span>
        )}
        <button
          type="button"
          className="link-btn entry-meta-toggle"
          aria-expanded={false}
          onClick={() => {
            setDraft(Object.fromEntries(active.map((f) => [f.key, meta[f.key] ?? ''])));
            setOpen(true);
          }}
        >
          <Icons.meta size={ICON_SIZE.inline} aria-hidden="true" />
          {shown.length > 0 ? t('history.metaEdit') : t('history.metaAdd')}
        </button>
      </div>
    );
  }

  return (
    <div className="entry-meta entry-meta-open">
      {/* Only rendered when the caller wired it up: a select with one option
          and no handler is a control that looks broken. */}
      {onGroupChange && (
        <label className="entry-meta-field">
          <span className="entry-meta-label">{t('history.groupIn')}</span>
          <select
            value={entry?.groupId ?? ''}
            aria-label={t('history.groupIn')}
            onChange={(e) => onGroupChange(entry.id, e.target.value || null)}
          >
            <option value="">{t('history.groupNone')}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </label>
      )}
      {active.map((f) => (
        <label className="entry-meta-field" key={f.key}>
          <span className="entry-meta-label">
            {labelOf(f, locale)}
            {f.required && <span className="entry-meta-req" aria-hidden="true">*</span>}
          </span>
          {f.type === 'select' ? (
            <select
              value={draft[f.key] ?? ''}
              aria-label={labelOf(f, locale)}
              onChange={(e) => { setDraft((d) => ({ ...d, [f.key]: e.target.value })); commit(f.key, e.target.value); }}
            >
              <option value="">{t('history.metaNone')}</option>
              {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              type={f.type === 'number' ? 'text' : f.type}
              inputMode={f.type === 'number' ? 'decimal' : undefined}
              value={draft[f.key] ?? ''}
              maxLength={f.maxLength}
              placeholder={f.placeholder?.[locale] ?? f.placeholder?.zh ?? ''}
              aria-label={labelOf(f, locale)}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              onBlur={(e) => commit(f.key, e.target.value)}
              onKeyDown={(e) => {
                // Enter commits and closes, which is what a one-line field implies.
                if (e.key === 'Enter') { commit(f.key, e.target.value); setOpen(false); }
                if (e.key === 'Escape') setOpen(false);
              }}
            />
          )}
        </label>
      ))}
      <button type="button" className="link-btn" onClick={() => setOpen(false)}>
        {t('history.metaDone')}
      </button>
    </div>
  );
}
