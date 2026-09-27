import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  loadTemplate, saveTemplate, setTemplate as installTemplate, getTemplate,
} from './field-template.mjs';

/*
 * The record-field template, as React state.
 *
 * ## Why a separate context from the settings panel
 *
 * The template is read by the record editor on every row of the history list
 * and by the export plan, and written only by the settings panel. Passing it
 * down as props would thread it through `App` → `HistoryPanel` → `EntryMeta`
 * and through the export menu for a value that two unrelated subtrees need.
 *
 * ## Why the module-level slot is written here
 *
 * `field-template.mjs` keeps the resolved template in a module slot, because
 * `export.mjs` is a pure string builder with no React in it and has to be able
 * to ask which fields are in force. This provider is the only writer: it
 * installs into the slot and mirrors the same value into React state, so the
 * module and the render tree can never disagree about what is in force.
 *
 * The read order on mount is template first, then history. `migrateHistory`
 * drops keys that are not retained, so loading records against the built-ins
 * and installing the user's template afterwards would discard every custom
 * field's value on the first paint after a reload — a silent data loss that
 * only shows up on the second visit.
 */
const FieldsContext = createContext(null);

export function FieldsProvider({ store, children }) {
  const [fields, setFields] = useState(() => installTemplate(loadTemplate(store)));

  /** Replace the template and persist it. Called by the settings panel. */
  const update = useCallback((next) => {
    const installed = installTemplate(next);
    setFields(installed);
    saveTemplate(store, installed);
    return installed;
  }, [store]);

  const value = useMemo(() => ({
    fields,
    /** The active fields, in template order. */
    active: fields.filter((f) => !f.retired),
    update,
  }), [fields, update]);

  return <FieldsContext.Provider value={value}>{children}</FieldsContext.Provider>;
}

/**
 * The template in force.
 *
 * Falls back to the module slot rather than throwing when there is no
 * provider. `EntryMeta` is mounted by tests that do not wrap it, and a test
 * that has to build a provider to render one row is a test that will stop
 * being written.
 */
export function useFields() {
  const ctx = useContext(FieldsContext);
  if (ctx) return ctx;
  const fields = getTemplate();
  return { fields, active: fields.filter((f) => !f.retired), update: () => fields };
}
