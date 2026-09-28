/**
 * The user's record-field template.
 *
 * ## Why this exists
 *
 * `META_FIELDS` in `history.mjs` was a frozen three-item constant: experiment,
 * purpose, operator. Users asked for more — a sample number, an instrument, a
 * storage location — and there was no way to have one. The three fields were
 * also the only ones the app would *accept*: `setEntryMeta` dropped any key not
 * on that list.
 *
 * The whitelist itself was right. Its reason is stated in `history.mjs` and it
 * is a good one: an undeclared key exports as a column nothing can label. What
 * was wrong was that the whitelist was compiled in. This module makes it a
 * *resolved* list — the three built-ins plus whatever the user has defined —
 * so the guarantee holds while the set stays open.
 *
 * ## Why a key is immutable and a label is not
 *
 * The same rule `field-labels.mjs` already follows: the key is what every
 * stored record points at, so renaming it would orphan the values. A label is
 * presentation, and a user who wrote "样品号" and later wants "Sample ID"
 * should get the new label on their existing records rather than a new field.
 *
 * ## Why retiring beats deleting
 *
 * A deleted field takes its label with it, and the records that carry a value
 * for it are still there — so the export emits a column with no heading, which
 * is exactly the failure the whitelist exists to prevent. Retiring keeps the
 * definition (for labels) while removing the field from the editor (so new
 * records do not carry it). The value is never destroyed; the field simply
 * stops being asked for.
 */

export const TEMPLATE_KEY = 'lab-calc.field-template.v1';

/**
 * Storage-bounds, not validation. A user hitting these has a different problem.
 *
 * `MAX_FIELDS` and `MAX_OPTIONS` are exported because the editor has to say so
 * on screen; the two caps below are only ever enforced, never displayed.
 */
const MAX_LABEL = 40;
const MAX_VALUE = 200;

export const MAX_FIELDS = 20;
export const MAX_OPTIONS = 20;

const FIELD_TYPES = ['text', 'number', 'date', 'select'];

/**
 * The three fields the app shipped with.
 *
 * Keys and `maxLength` are frozen — every stored record and every export from
 * a previous version refers to them. `builtin: true` means the field cannot be
 * deleted, only retired: an existing user's records all carry values under
 * these keys and the export must be able to label them.
 */
export const BUILTIN_FIELDS = [
  {
    key: 'experiment',
    builtin: true,
    type: 'text',
    label: { zh: '实验号', en: 'Experiment' },
    placeholder: { zh: '如 EXP-2026-14', en: 'e.g. EXP-2026-14' },
    maxLength: 60,
  },
  {
    key: 'purpose',
    builtin: true,
    type: 'text',
    label: { zh: '用途', en: 'Purpose' },
    placeholder: { zh: '如 毕业论文第三章', en: 'e.g. thesis chapter 3' },
    maxLength: 120,
  },
  {
    key: 'operator',
    builtin: true,
    type: 'text',
    label: { zh: '操作人', en: 'Operator' },
    placeholder: { zh: '如 张三', en: 'e.g. your name' },
    maxLength: 60,
  },
];

/**
 * A short deterministic tag for a label that yields no ASCII slug.
 *
 * FNV-1a over the label's code points, base 36.
 *
 * The fallback used to be the constant `u-field`, and that was a data bug: a
 * user who deleted 「样品编号」 and then added 「样品重量」 got the same key back,
 * so every record still carrying the first field's value rendered it under the
 * second field's label — silently, and with no way to tell the two apart. The
 * counter below does not help, because it only knows the fields that exist
 * right now, and the deleted one no longer does.
 *
 * Deriving the key from the label fixes that at the root: two different labels
 * cannot collide. It is a hash rather than a random suffix on purpose, so that
 * re-adding the *same* label lands on the same key — which reattaches the
 * values the deleted field left on old records instead of forking them.
 *
 * Deterministic also means the key is stable across reloads and across
 * machines, so a record exported from one and imported into another keeps
 * pointing at the same field.
 */
function labelTag(label) {
  let h = 0x811c9dc5;
  for (const ch of String(label ?? '')) {
    const cp = ch.codePointAt(0);
    h = Math.imul(h ^ (cp & 0xffff), 0x01000193) >>> 0;
    h = Math.imul(h ^ (cp >>> 16), 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * A key for a new user-defined field.
 *
 * Derived from the label where the label is ASCII, and from a hash of it where
 * it is not — a Cyrillic or CJK label slugifies to nothing, and falling back to
 * a shared constant would let two unrelated fields claim one key. The counter
 * below is the second line of defence, for the one case a label-derived key
 * cannot separate: the same label added twice.
 *
 * The `u-` prefix keeps user keys out of the built-in namespace; the `x-` on a
 * tag keeps a hash from ever colliding with a real slug.
 */
export function makeKey(label, taken = []) {
  const used = new Set(taken);
  const slug = String(label ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  const base = slug.length > 0 ? `u-${slug}` : `u-x-${labelTag(label)}`;
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  // 1000 fields with the same label is not a state a user reaches; failing
  // loudly beats returning a key that collides.
  throw new Error(`无法为「${label}」生成唯一的字段名`);
}

/**
 * Normalise one definition read from storage or from a user edit.
 *
 * `base` is the shipped definition being overridden, when there is one. It
 * matters: a stored override for a built-in may carry nothing but
 * `{ key, retired: true }` — the user retired the field and never touched its
 * label — and validating that in isolation would drop it for having no label,
 * silently un-retiring the field on the next load. Overrides are merged onto
 * the built-in first, then validated.
 */
function cleanField(raw, base = null) {
  if (!raw || typeof raw !== 'object') return null;
  const key = typeof raw.key === 'string' ? raw.key.trim() : '';
  if (key === '') return null;
  const merged = base ? { ...base, ...raw, key } : raw;
  const type = FIELD_TYPES.includes(merged.type) ? merged.type : 'text';
  const label = {
    zh: String(merged.label?.zh ?? '').trim().slice(0, MAX_LABEL),
    en: String(merged.label?.en ?? '').trim().slice(0, MAX_LABEL),
  };
  // At least one language has to name it, or the UI renders a blank row.
  if (label.zh === '' && label.en === '') return null;
  const field = {
    key,
    type,
    label,
    maxLength: type === 'text' || type === 'select'
      ? Math.min(Number(merged.maxLength) > 0 ? Number(merged.maxLength) : 60, MAX_VALUE)
      : 40,
  };
  if (base || merged.builtin === true) field.builtin = true;
  if (merged.retired === true) field.retired = true;
  if (merged.required === true) field.required = true;
  const def = typeof merged.default === 'string' ? merged.default.trim().slice(0, MAX_VALUE) : '';
  if (def !== '') field.default = def;
  if (merged.placeholder?.zh || merged.placeholder?.en) {
    field.placeholder = {
      zh: String(merged.placeholder?.zh ?? '').trim().slice(0, MAX_LABEL),
      en: String(merged.placeholder?.en ?? '').trim().slice(0, MAX_LABEL),
    };
  }
  if (type === 'select') {
    const options = (Array.isArray(merged.options) ? merged.options : [])
      .map((o) => String(o ?? '').trim().slice(0, MAX_LABEL))
      .filter((o) => o !== '')
      .slice(0, MAX_OPTIONS);
    // A select with no options cannot be answered; degrade it to text rather
    // than render a control that offers nothing. A built-in being *overridden*
    // keeps its own type, so a text field stays text.
    if (options.length === 0) {
      if (!base) field.type = 'text';
    } else {
      field.options = options;
    }
  }
  return field;
}

/**
 * Drop the retired flag from a definition the user wants back.
 *
 * Not the same as `{...f, retired: false}`: the flag must be *absent* rather
 * than false, because `templateJson` round-trips through JSON and a stored
 * `retired: false` reads as an explicit statement that this field was once
 * considered for retirement.
 */
function unretire(field) {
  const { retired: _drop, ...rest } = field;
  return rest;
}

/**
 * The template as the app uses it: built-ins first, then the user's fields.
 *
 * Built-ins keep their position and cannot be removed; a user field added
 * later lands after them. Order matters because it is the order the editor
 * renders and the order the export writes columns in.
 */
export function resolveTemplate(userFields = []) {
  const raw = (Array.isArray(userFields) ? userFields : []).filter((f) => f && typeof f === 'object');
  // Each definition is validated against the built-in it overrides, so a
  // stored `{ key, retired: true }` keeps the built-in's label instead of
  // being discarded for not carrying one.
  const clean = raw
    .map((f) => cleanField(f, BUILTIN_FIELDS.find((b) => b.key === f.key) ?? null))
    .filter(Boolean);
  // A stored override of a built-in is applied in place rather than appended,
  // so the built-in keeps its position.
  const merged = BUILTIN_FIELDS.map((b) => {
    const override = clean.find((f) => f.key === b.key);
    return override ? { ...override, builtin: true } : cleanField(b);
  });
  const extras = clean.filter((f) => !BUILTIN_FIELDS.some((b) => b.key === f.key));
  return [...merged, ...extras].slice(0, MAX_FIELDS);
}

/** The fields a new record is asked for: not retired. */
export function activeFields(template) {
  return (template ?? []).filter((f) => !f.retired);
}

/**
 * Every key a record is allowed to carry.
 *
 * Retired fields are included deliberately. A record stored before the field
 * was retired still holds a value under that key, and `migrateHistory` drops
 * what is not on this list — so excluding retired keys would erase those values
 * on the next load, which is the destruction retiring exists to avoid.
 */
export function retainedKeys(template) {
  return (template ?? []).map((f) => f.key);
}

/** Look up one field's definition, retired included. */
export function fieldOf(template, key) {
  return (template ?? []).find((f) => f.key === key) ?? null;
}

/**
 * The label to render, in the reader's language.
 *
 * Falls back to the other language rather than to the key: a user who filled
 * only the Chinese label is better served by seeing 样品号 in an English
 * interface than by seeing `u-yangpin`.
 */
export function labelOf(field, locale = 'zh') {
  if (!field) return '';
  const other = locale === 'zh' ? 'en' : 'zh';
  return field.label?.[locale] || field.label?.[other] || field.key;
}

/**
 * What a record is born with.
 *
 * A user annotating fifty records with the same operator should type it once,
 * in settings. Fields without a default contribute nothing, so a template with
 * no defaults produces a record with no `meta` — the same shape as before.
 */
export function defaultsOf(template) {
  const out = {};
  for (const f of activeFields(template)) {
    if (typeof f.default === 'string' && f.default.trim() !== '') out[f.key] = f.default.trim();
  }
  return out;
}

// --------------------------------------------------------------- operations

/** Add a field. Returns the new list and the created definition. */
export function addField(fields, label, type = 'text') {
  const list = Array.isArray(fields) ? fields : [];
  if (list.length >= MAX_FIELDS) {
    throw new Error(`字段数已达上限 ${MAX_FIELDS} 个`);
  }
  const cleanLabel = { zh: String(label ?? '').trim().slice(0, MAX_LABEL), en: '' };
  if (cleanLabel.zh === '') throw new Error('字段名不能为空');
  const key = makeKey(cleanLabel.zh, list.map((f) => f.key));
  const created = {
    key,
    type: FIELD_TYPES.includes(type) ? type : 'text',
    label: cleanLabel,
    maxLength: 60,
  };
  return { fields: [...list, created], field: created };
}

/**
 * Change a field's presentation.
 *
 * `key` is absent from what may be patched — deliberately. It is the pointer
 * every stored record holds; changing it would silently detach the values.
 */
export function updateField(fields, key, patch = {}) {
  return (fields ?? []).map((f) => {
    if (f.key !== key) return f;
    const next = { ...f };
    if (patch.label !== undefined) {
      const zh = String(patch.label?.zh ?? f.label?.zh ?? '').trim().slice(0, MAX_LABEL);
      const en = String(patch.label?.en ?? f.label?.en ?? '').trim().slice(0, MAX_LABEL);
      if (zh === '' && en === '') return f;
      next.label = { zh, en };
    }
    if (patch.default !== undefined) {
      const d = String(patch.default ?? '').trim().slice(0, MAX_VALUE);
      if (d === '') delete next.default;
      else next.default = d;
    }
    if (patch.required !== undefined) {
      if (patch.required) next.required = true;
      else delete next.required;
    }
    if (patch.options !== undefined && next.type === 'select') {
      const options = (Array.isArray(patch.options) ? patch.options : [])
        .map((o) => String(o ?? '').trim().slice(0, MAX_LABEL))
        .filter((o) => o !== '')
        .slice(0, MAX_OPTIONS);
      if (options.length === 0) delete next.options;
      else next.options = options;
    }
    return next;
  });
}

/**
 * Take a field out of the editor without losing its label.
 *
 * A built-in is retired too, not deleted — its key is on every record the app
 * has ever written, and the export still has to name that column.
 */
export function retireField(fields, key) {
  return (fields ?? []).map((f) => (f.key === key ? { ...f, retired: true } : f));
}

/** Put a retired field back in the editor. */
export function restoreField(fields, key) {
  return (fields ?? []).map((f) => (f.key === key ? unretire(f) : f));
}

/**
 * Delete a user-defined field.
 *
 * Refuses a built-in: the key is on stored records, and removing the
 * definition leaves the export with a column it cannot label. Retirement is
 * the supported way to take a built-in out of the way.
 */
export function deleteField(fields, key) {
  const target = (fields ?? []).find((f) => f.key === key);
  if (!target) return fields;
  if (target.builtin) {
    throw new Error('内置字段不能删除，只能停用');
  }
  return (fields ?? []).filter((f) => f.key !== key);
}

/**
 * Move one user field earlier or later among the user fields.
 *
 * Built-ins are not movable: their order is the order every previous export
 * wrote its columns in, and shuffling them would silently reorder a
 * spreadsheet a reader has been sorting against.
 */
export function moveField(fields, key, delta) {
  const list = [...(fields ?? [])];
  const i = list.findIndex((f) => f.key === key);
  if (i < 0 || list[i].builtin === true) return fields;
  const movable = list.filter((f) => f.builtin !== true);
  const m = movable.findIndex((f) => f.key === key);
  const target = m + Math.sign(delta || 0);
  if (target < 0 || target >= movable.length) return fields;
  [movable[m], movable[target]] = [movable[target], movable[m]];
  let n = 0;
  return list.map((f) => (f.builtin === true ? f : movable[n++]));
}

// ------------------------------------------------------- the template in force

/**
 * The field definitions currently in force.
 *
 * A module-level slot rather than a parameter on the six functions that need
 * it. The alternative — threading a template through `setEntryMeta`,
 * `migrateHistory`, `filterHistory`, `usedMetaFields`, `EntryMeta` and the
 * export plan — would put a new argument on every call site in the app for a
 * value that is global by nature: there is one user, one template, one
 * document.
 *
 * It lives here rather than in `history.mjs` because both `history.mjs` and
 * `export.mjs` need it, and a slot owned by one of them would make the other
 * import a module it has no other reason to know about.
 *
 * `resolveTemplate` runs on every assignment, so nothing downstream can read a
 * half-built list. The initial value is the built-ins, which is what every
 * recorder and every test saw before templates existed.
 */
let current = resolveTemplate([]);

/** Install a template. Anything invalid falls back to the built-ins. */
export function setTemplate(fields) {
  current = resolveTemplate(fields);
  return current;
}

/** The resolved template in force. */
export function getTemplate() {
  return current;
}

/** The keys a record may carry, per the template in force. */
export function currentKeys() {
  return retainedKeys(current);
}

/** One field's maxLength, from the template in force. */
export function currentMaxLength(key) {
  return fieldOf(current, key)?.maxLength ?? 60;
}

// ------------------------------------------------------------------ storage

/**
 * Read the stored template.
 *
 * Returns the raw stored list — including any override of a built-in — not a
 * resolved template. The caller holds this as "what the user has customised"
 * and resolves it on every render, which is what lets a built-in's label change
 * in a later release without the stored list shadowing it. `resolveTemplate`
 * is run here only as a validation pass, so a corrupted entry is dropped at the
 * boundary rather than reaching the editor.
 */
export function loadTemplate(store) {
  let raw = null;
  try {
    raw = store?.getItem(TEMPLATE_KEY) ?? null;
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const fields = Array.isArray(parsed) ? parsed : parsed?.fields;
    if (!Array.isArray(fields)) return [];
    const kept = new Set(resolveTemplate(fields).map((f) => f.key));
    return fields.filter((f) => f && typeof f === 'object' && kept.has(f.key));
  } catch {
    return [];
  }
}

/**
 * Persist the template.
 *
 * Only the user's own fields are written. The built-ins are code, and storing
 * a copy would freeze them at the version that wrote them — a later release
 * that reworded a built-in label would find its change shadowed by a stored
 * copy the user never asked for. What *is* stored for a built-in is an
 * override the user actually made (a relabelled or retired built-in).
 */
export function saveTemplate(store, fields) {
  const userFields = (fields ?? []).filter((f) => {
    if (f.builtin !== true) return true;
    const original = BUILTIN_FIELDS.find((b) => b.key === f.key);
    if (!original) return true;
    // Keep only a real deviation from the shipped definition.
    return f.retired === true
      || f.required === true
      || (f.label?.zh ?? '') !== original.label.zh
      || (f.label?.en ?? '') !== original.label.en
      || (f.default ?? '') !== (original.default ?? '');
  });
  try {
    store?.setItem(TEMPLATE_KEY, JSON.stringify({ version: 1, fields: userFields }));
  } catch {
    // A full quota or a private-mode browser. The template is convenience, not
    // data: losing it costs the user a re-entry, and throwing here would take
    // the record they were trying to annotate down with it.
  }
  return userFields;
}

/**
 * A stable JSON string for the template.
 *
 * The shape is rebuilt field by field rather than stringified straight off the
 * definitions: the objects coming in may carry an `undefined` placeholder or a
 * `retired: false`, and `JSON.stringify` drops the first while keeping the
 * second. Two templates that mean the same thing must serialise to the same
 * string, because this is what decides whether the panel shows a "modified"
 * badge.
 *
 * Property order is fixed by the literal below, so the output is byte-stable
 * without a key-sorting replacer.
 */
export function templateJson(fields) {
  const shape = (fields ?? []).map((f) => {
    const out = { key: f.key, type: f.type, label: { zh: f.label?.zh ?? '', en: f.label?.en ?? '' } };
    if (f.retired === true) out.retired = true;
    if (f.required === true) out.required = true;
    if (typeof f.default === 'string' && f.default !== '') out.default = f.default;
    if (Array.isArray(f.options) && f.options.length > 0) out.options = [...f.options];
    if (Number.isInteger(f.maxLength)) out.maxLength = f.maxLength;
    if (f.builtin === true) out.builtin = true;
    return out;
  });
  return JSON.stringify(shape);
}
