import React, { useState } from 'react';
import { Icons, ICON_SIZE } from '../icons.jsx';
import { useI18n } from '../LocaleContext.jsx';
import { useFields } from '../FieldsContext.jsx';
import {
  activeFields, labelOf, MAX_FIELDS,
  addField, updateField, retireField, restoreField, deleteField, moveField,
} from '../field-template.mjs';

/*
 * The record-field editor.
 *
 * ## The problem this solves
 *
 * The app shipped with three fixed record fields — experiment, purpose,
 * operator — and the user's request was that they be customisable. Users
 * reported the same three complaints, and they are one complaint:
 *
 *   「自定义功能不够丰富好用」「记录前就自定义」「记录后可以修改」
 *
 * The first is that three fields is not enough and cannot be changed. The
 * second and third are that the set has to apply *before* a record is written
 * (so a user annotating fifty records says the operator once) and stay
 * editable *after* (so a record written today can be re-filed tomorrow).
 *
 * ## Why retire and not delete
 *
 * Deleting a field takes its label with it, and every record that carries a
 * value under that key still exists — so the export emits a column with
 * nothing to head it. Retiring keeps the definition for labelling and drops
 * the field from the editor, which is what "I do not want to be asked this any
 * more" actually means. Built-ins cannot be deleted at all: their keys are on
 * every record the app has ever written.
 *
 * ## Why the panel shows retired fields
 *
 * A field that vanishes from the list when retired is a field the user cannot
 * get back, and the button that did it looks like a delete. Keeping the row
 * with a "已停用" mark is what makes the action reversible on screen.
 */

function FieldRow({ field, isFirst, isLast, onChange }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [zh, setZh] = useState(field.label?.zh ?? '');
  const [en, setEn] = useState(field.label?.en ?? '');
  const [def, setDef] = useState(field.default ?? '');

  function commitLabels() {
    const nextZh = zh.trim();
    const nextEn = en.trim();
    if (nextZh === (field.label?.zh ?? '') && nextEn === (field.label?.en ?? '')) return;
    // A field with no name in either language renders as a blank row and
    // exports with an empty heading. Refusing is better than accepting an
    // edit that breaks the field.
    if (nextZh === '' && nextEn === '') return;
    onChange((fields) => updateField(fields, field.key, { label: { zh: nextZh, en: nextEn } }));
  }

  return (
    <div className={`field-row${field.retired ? ' is-retired' : ''}`}>
      <div className="field-row-head">
        <span className="field-row-label">
          {labelOf(field, locale)}
          {field.required && <span className="entry-meta-req" aria-hidden="true">*</span>}
        </span>
        <span className="field-row-key" title={t('app.recField.keyHint')}>{field.key}</span>
        {field.builtin && <span className="field-row-tag">{t('app.recField.builtin')}</span>}
        {field.retired && <span className="field-row-tag is-off">{t('app.recField.retired')}</span>}
        <span className="grow" />
        {!field.builtin && (
          <>
            <button
              type="button" className="icon-btn" disabled={isFirst}
              title={t('app.recField.moveUp')} aria-label={`${t('app.recField.moveUp')}: ${labelOf(field, locale)}`}
              onClick={() => onChange((fields) => moveField(fields, field.key, -1))}
            >
              <Icons.caret size={ICON_SIZE.inline} className="up" aria-hidden="true" />
            </button>
            <button
              type="button" className="icon-btn" disabled={isLast}
              title={t('app.recField.moveDown')} aria-label={`${t('app.recField.moveDown')}: ${labelOf(field, locale)}`}
              onClick={() => onChange((fields) => moveField(fields, field.key, 1))}
            >
              <Icons.caret size={ICON_SIZE.inline} aria-hidden="true" />
            </button>
          </>
        )}
        <button
          type="button" className="icon-btn"
          title={field.retired ? t('app.recField.restore') : t('app.recField.retire')}
          aria-label={`${field.retired ? t('app.recField.restore') : t('app.recField.retire')}: ${labelOf(field, locale)}`}
          onClick={() => onChange((fields) => (
            field.retired ? restoreField(fields, field.key) : retireField(fields, field.key)
          ))}
        >
          <Icons.remove size={ICON_SIZE.inline} aria-hidden="true" />
        </button>
        {/* Only a user field can go for good. A built-in's key is on every
            record the app has written, so removing its definition would leave
            the export with a column it cannot name. */}
        {!field.builtin && (
          <button
            type="button" className="icon-btn"
            title={t('app.recField.delete')} aria-label={`${t('app.recField.delete')}: ${labelOf(field, locale)}`}
            onClick={() => onChange((fields) => deleteField(fields, field.key))}
          >
            <Icons.close size={ICON_SIZE.inline} aria-hidden="true" />
          </button>
        )}
        <button
          type="button" className="icon-btn" aria-expanded={open}
          title={t('app.recField.edit')} aria-label={`${t('app.recField.edit')}: ${labelOf(field, locale)}`}
          onClick={() => {
            if (!open) { setZh(field.label?.zh ?? ''); setEn(field.label?.en ?? ''); setDef(field.default ?? ''); }
            setOpen((v) => !v);
          }}
        >
          <Icons.meta size={ICON_SIZE.inline} aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div className="field-row-body">
          <label className="field-row-field">
            <span className="entry-meta-label">{t('app.recField.labelZh')}</span>
            <input
              type="text" value={zh} maxLength={40} aria-label={t('app.recField.labelZh')}
              onChange={(e) => setZh(e.target.value)} onBlur={commitLabels}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitLabels(); setOpen(false); } }}
            />
          </label>
          <label className="field-row-field">
            <span className="entry-meta-label">{t('app.recField.labelEn')}</span>
            <input
              type="text" value={en} maxLength={40} aria-label={t('app.recField.labelEn')}
              placeholder={t('app.recField.labelEnHint')}
              onChange={(e) => setEn(e.target.value)} onBlur={commitLabels}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitLabels(); setOpen(false); } }}
            />
          </label>
          <label className="field-row-field">
            <span className="entry-meta-label">{t('app.recField.default')}</span>
            <input
              type="text" value={def} maxLength={200} aria-label={t('app.recField.default')}
              placeholder={t('app.recField.defaultHint')}
              onChange={(e) => setDef(e.target.value)}
              onBlur={(e) => onChange((fields) => updateField(fields, field.key, { default: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onChange((fields) => updateField(fields, field.key, { default: def }));
                  setOpen(false);
                }
              }}
            />
          </label>
          <label className="field-row-check">
            <input
              type="checkbox" checked={field.required === true}
              onChange={(e) => onChange((fields) => updateField(fields, field.key, { required: e.target.checked }))}
            />
            <span>{t('app.recField.required')}</span>
          </label>
        </div>
      )}
    </div>
  );
}

export default function FieldsPanel() {
  const { t } = useI18n();
  const { fields, update } = useFields();
  const [open, setOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  const active = activeFields(fields);
  const retiredCount = fields.length - active.length;
  const atCap = fields.length >= MAX_FIELDS;

  function add() {
    const label = newLabel.trim();
    if (label === '' || atCap) return;
    try {
      const { fields: next } = addField(fields, label, 'text');
      update(next);
      setNewLabel('');
    } catch {
      // At the cap, or a label that produced no usable key. Both are states the
      // disabled button already prevents; this keeps a race from throwing.
    }
  }

  return (
    <div className="settings-block">
      <button
        type="button" className="settings-block-toggle" aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="settings-label">{t('app.setFields')}</span>
        <span className="settings-current">
          {t('app.recField.count', { n: active.length })}
          {retiredCount > 0 ? ` · ${t('app.recField.retiredCount', { n: retiredCount })}` : ''}
        </span>
        <Icons.caret size={ICON_SIZE.inline} className="caret" aria-hidden="true" />
      </button>

      {open && (
        <div className="fields-panel">
          <p className="fields-hint">{t('app.recField.hint')}</p>

          <div className="fields-list">
            {fields.map((f, i) => (
              <FieldRow
                key={f.key}
                field={f}
                isFirst={i === 0 || fields[i - 1]?.builtin === true}
                isLast={i === fields.length - 1}
                onChange={update}
              />
            ))}
          </div>

          <div className="fields-add">
            <label className="sr-only" htmlFor="new-field-label">{t('app.recField.addLabel')}</label>
            <input
              id="new-field-label" type="text" value={newLabel} maxLength={40}
              placeholder={t('app.recField.addPlaceholder')}
              disabled={atCap}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            />
            <button type="button" className="link-btn" onClick={add} disabled={atCap || newLabel.trim() === ''}>
              <Icons.add size={ICON_SIZE.inline} aria-hidden="true" /> {t('app.recField.add')}
            </button>
          </div>

          {atCap && <p className="fields-warn">{t('app.recField.atCap', { n: MAX_FIELDS })}</p>}
        </div>
      )}
    </div>
  );
}
