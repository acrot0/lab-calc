import React, { useMemo } from 'react';
import { useI18n } from '../LocaleContext.jsx';
import { fieldLabel } from '../field-labels.mjs';

/**
 * Choose which fields the data-view export carries.
 *
 * The user's words: 「导出格式不够丰富，而且不支持自定义」. The workbook already had
 * the two shapes it needs — one row per record, and one column per field — and
 * the second one grows a column for every field the app gains, so it had
 * become unusable at exactly the moment it was most useful.
 *
 * Unchecking a column is how a reader says "this export is about the masses".
 * A spreadsheet with twenty-three columns is not richer than one with four; it
 * is one nobody reads.
 *
 * Everything is checked to begin with. That is the honest default: the user
 * has not told us what they want yet, and silently dropping columns they never
 * saw would be a data loss they could not have prevented. Narrowing is a
 * deliberate act, and this is where it happens.
 *
 * The keys are the raw field keys, not labels — the same rule as everywhere
 * else in the export layer. A label is prose and can be reworded; a stored key
 * cannot.
 */
export default function ColumnPicker({ available, selected, onChange }) {
  const { t, locale } = useI18n();

  // `detailColumns` names these `inputKeys`/`outputKeys`, matching the shape
  // `xlsxPlan` reads. Destructuring them as `inputs`/`outputs` left both
  // undefined and threw on the first `.length` — the picker crashed the whole
  // panel rather than rendering empty.
  const { inputKeys: inputs, outputKeys: outputs } = useMemo(
    () => available ?? { inputKeys: [], outputKeys: [] },
    [available],
  );
  const chosen = selected ?? { inputs: null, outputs: null };

  /** Whether a key is currently on. `null` means "all of them". */
  const isOn = (side, key) => (chosen[side] === null || chosen[side] === undefined
    ? true
    : chosen[side].includes(key));

  const toggle = (side, key) => {
    const all = side === 'inputs' ? inputs : outputs;
    // Materialise the current selection before editing it, so the first click
    // narrows from "everything" rather than from an empty list.
    const current = chosen[side] === null || chosen[side] === undefined
      ? [...all]
      : [...chosen[side]];
    const on = current.includes(key);
    /*
     * Filter against `all` rather than mutating `current`.
     *
     * The obvious `current.filter(...)` / `[...current, key]` pair loses the
     * canonical order: rechecking a box appends it to the end, so the set is
     * right and its order is not — and the equality test below then never sees
     * "everything is on", because the two arrays hold the same members in a
     * different sequence. Rebuilding from `all` keeps one order throughout.
     */
    const next = all.filter((k) => (k === key ? !on : current.includes(k)));
    // Back to `null` when everything is on again, so "select all" and "never
    // touched it" are the same state rather than two that behave alike.
    onChange({ ...chosen, [side]: next.length === all.length ? null : next });
  };

  const group = (side, keys) => {
    if (keys.length === 0) return null;
    const label = side === 'inputs' ? t('history.colInputs') : t('history.colOutputs');
    const onCount = keys.filter((k) => isOn(side, k)).length;
    return (
      <div className="col-picker-group" key={side}>
        <div className="col-picker-head">
          <span>{label}</span>
          <span className="col-picker-count">{t('history.colCount', { on: onCount, all: keys.length })}</span>
        </div>
        <div className="col-picker-list">
          {keys.map((k) => (
            <label className="col-picker-item" key={k}>
              <input
                type="checkbox"
                checked={isOn(side, k)}
                onChange={() => toggle(side, k)}
              />
              <span>{fieldLabel(k, locale)}</span>
            </label>
          ))}
        </div>
      </div>
    );
  };

  if (inputs.length === 0 && outputs.length === 0) {
    return <p className="hint">{t('history.colNone')}</p>;
  }

  return (
    <div className="col-picker">
      <p className="hint">{t('history.colHint')}</p>
      {group('inputs', inputs)}
      {group('outputs', outputs)}
    </div>
  );
}
