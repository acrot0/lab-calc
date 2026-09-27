import { describe, it, expect } from 'vitest';
import {
  BUILTIN_FIELDS, TEMPLATE_KEY, MAX_FIELDS, MAX_OPTIONS,
  makeKey, resolveTemplate, activeFields, retainedKeys, fieldOf, labelOf, defaultsOf,
  addField, updateField, retireField, restoreField, deleteField, moveField,
  loadTemplate, saveTemplate, templateJson,
} from '../src/ui/field-template.mjs';
import { memoryStore } from '../src/ui/history.mjs';

/*
 * The record-field template.
 *
 * The three built-in fields were a frozen constant and the whole point of this
 * module is that they are not. Two properties matter more than any individual
 * operation and are tested first: a stored record never loses a value because
 * a field was renamed or retired, and the built-ins keep their keys.
 */

describe('makeKey', () => {
  it('should derive a key from an ASCII label', () => {
    expect(makeKey('Sample ID')).toBe('u-sample-id');
  });

  it('should still produce a key when the label has no ASCII characters', () => {
    // A pure-CJK label slugifies to the empty string. Falling back to a blank
    // key would collide on the very next field, so the fallback is a name.
    expect(makeKey('样品编号')).toBe('u-field');
  });

  it('should not reuse a key that is already taken', () => {
    expect(makeKey('样品编号', ['u-field'])).toBe('u-field-2');
    expect(makeKey('样品编号', ['u-field', 'u-field-2'])).toBe('u-field-3');
  });

  it('should not collide when a slugified label matches an existing key', () => {
    expect(makeKey('Sample ID', ['u-sample-id'])).toBe('u-sample-id-2');
  });
});

describe('resolveTemplate', () => {
  it('should return the three built-ins in their shipped order when nothing is defined', () => {
    const t = resolveTemplate([]);
    expect(t.map((f) => f.key)).toEqual(['experiment', 'purpose', 'operator']);
  });

  it('should append user fields after the built-ins', () => {
    const t = resolveTemplate([{ key: 'u-sample', label: { zh: '样品号' } }]);
    expect(t.map((f) => f.key)).toEqual(['experiment', 'purpose', 'operator', 'u-sample']);
  });

  it('should keep a built-in in place when the user relabels it', () => {
    const t = resolveTemplate([{ key: 'operator', label: { zh: '操作者', en: 'Operator' } }]);
    expect(t.map((f) => f.key)).toEqual(['experiment', 'purpose', 'operator']);
    expect(t[2].label.zh).toBe('操作者');
    expect(t[2].builtin).toBe(true);
  });

  it('should keep a built-in in place when the user retires it', () => {
    const t = resolveTemplate([{ key: 'purpose', retired: true }]);
    expect(t.map((f) => f.key)).toEqual(['experiment', 'purpose', 'operator']);
    expect(t[1].retired).toBe(true);
    // The label survives retirement — the export still has to name the column.
    expect(t[1].label.zh).toBe('用途');
  });

  it('should drop a field definition with no label in either language', () => {
    // A nameless row renders blank and cannot be labelled on export.
    const t = resolveTemplate([{ key: 'u-x', label: { zh: '', en: '' } }]);
    expect(t.map((f) => f.key)).not.toContain('u-x');
  });

  it('should drop a field definition with no key', () => {
    const t = resolveTemplate([{ label: { zh: '样品号' } }]);
    expect(t).toHaveLength(3);
  });

  it('should fall back to text when a select has no usable options', () => {
    // A select with nothing to choose is a control that cannot be answered.
    const t = resolveTemplate([{ key: 'u-s', type: 'select', label: { zh: '仪器' }, options: ['  '] }]);
    expect(fieldOf(t, 'u-s').type).toBe('text');
  });

  it('should keep options for a select that has them', () => {
    const t = resolveTemplate([{
      key: 'u-s', type: 'select', label: { zh: '仪器' }, options: ['HPLC', 'NMR'],
    }]);
    expect(fieldOf(t, 'u-s').options).toEqual(['HPLC', 'NMR']);
  });

  it('should cap the total field count', () => {
    const many = Array.from({ length: MAX_FIELDS + 10 }, (_, i) => ({
      key: `u-f${i}`, label: { zh: `字段${i}` },
    }));
    expect(resolveTemplate(many)).toHaveLength(MAX_FIELDS);
  });
});

describe('activeFields', () => {
  it('should leave out a retired field so new records do not ask for it', () => {
    const t = resolveTemplate([{ key: 'purpose', retired: true }]);
    expect(activeFields(t).map((f) => f.key)).toEqual(['experiment', 'operator']);
  });
});

describe('retainedKeys', () => {
  it('should include a retired field so stored values survive a reload', () => {
    // This is the whole reason retirement is not deletion: migrateHistory
    // drops keys that are not retained, so excluding a retired key would
    // erase the values of every record that had one.
    const t = resolveTemplate([{ key: 'purpose', retired: true }]);
    expect(retainedKeys(t)).toContain('purpose');
  });
});

describe('labelOf', () => {
  it('should return the label in the reader language', () => {
    const f = { key: 'u-x', label: { zh: '样品号', en: 'Sample ID' } };
    expect(labelOf(f, 'zh')).toBe('样品号');
    expect(labelOf(f, 'en')).toBe('Sample ID');
  });

  it('should fall back to the other language rather than the raw key', () => {
    // Showing 样品号 in an English interface beats showing `u-yangpin`.
    const f = { key: 'u-yangpin', label: { zh: '样品号', en: '' } };
    expect(labelOf(f, 'en')).toBe('样品号');
  });

  it('should return an empty string for a missing field', () => {
    expect(labelOf(null, 'zh')).toBe('');
  });
});

describe('defaultsOf', () => {
  it('should return nothing when no field has a default', () => {
    // A template with no defaults must produce a record with no `meta` at all,
    // which is the shape every record had before this feature existed.
    expect(defaultsOf(resolveTemplate([]))).toEqual({});
  });

  it('should return the defaults of active fields', () => {
    const t = resolveTemplate([
      { key: 'u-op', label: { zh: '操作人' }, default: '张三' },
    ]);
    expect(defaultsOf(t)).toEqual({ 'u-op': '张三' });
  });

  it('should not apply a retired field default', () => {
    const t = resolveTemplate([
      { key: 'u-op', label: { zh: '操作人' }, default: '张三', retired: true },
    ]);
    expect(defaultsOf(t)).toEqual({});
  });
});

describe('addField', () => {
  it('should append a field and return it', () => {
    const { fields, field } = addField([], '样品编号', 'text');
    expect(field.key).toBe('u-field');
    expect(fields).toHaveLength(1);
  });

  it('should refuse an empty label', () => {
    expect(() => addField([], '   ')).toThrow();
  });

  it('should refuse to exceed the field cap', () => {
    const many = Array.from({ length: MAX_FIELDS }, (_, i) => ({
      key: `u-f${i}`, label: { zh: `f${i}` },
    }));
    expect(() => addField(many, '多一个')).toThrow();
  });

  it('should carry the type through', () => {
    const { field } = addField([], '日期', 'date');
    expect(field.type).toBe('date');
  });
});

describe('updateField', () => {
  const base = resolveTemplate([]);

  it('should relabel without changing the key', () => {
    // Changing the key would detach every value stored under it.
    const next = updateField(base, 'experiment', { label: { zh: '实验编号', en: '' } });
    const f = fieldOf(next, 'experiment');
    expect(f.label.zh).toBe('实验编号');
    expect(f.key).toBe('experiment');
  });

  it('should set and clear a default', () => {
    let next = updateField(base, 'operator', { default: '张三' });
    expect(fieldOf(next, 'operator').default).toBe('张三');
    next = updateField(next, 'operator', { default: '  ' });
    expect(fieldOf(next, 'operator')).not.toHaveProperty('default');
  });

  it('should set and clear the required flag', () => {
    let next = updateField(base, 'operator', { required: true });
    expect(fieldOf(next, 'operator').required).toBe(true);
    next = updateField(next, 'operator', { required: false });
    expect(fieldOf(next, 'operator')).not.toHaveProperty('required');
  });

  it('should refuse to blank out both labels', () => {
    const next = updateField(base, 'experiment', { label: { zh: '', en: '' } });
    expect(fieldOf(next, 'experiment').label.zh).toBe('实验号');
  });

  it('should replace select options', () => {
    const withSelect = resolveTemplate([
      { key: 'u-s', type: 'select', label: { zh: '仪器' }, options: ['HPLC'] },
    ]);
    const next = updateField(withSelect, 'u-s', { options: ['NMR', 'HPLC'] });
    expect(fieldOf(next, 'u-s').options).toEqual(['NMR', 'HPLC']);
  });

  it('should cap the option count', () => {
    const withSelect = resolveTemplate([
      { key: 'u-s', type: 'select', label: { zh: '仪器' }, options: ['A'] },
    ]);
    const many = Array.from({ length: MAX_OPTIONS + 5 }, (_, i) => `opt${i}`);
    expect(fieldOf(updateField(withSelect, 'u-s', { options: many }), 'u-s').options)
      .toHaveLength(MAX_OPTIONS);
  });

  it('should leave other fields alone', () => {
    const next = updateField(base, 'experiment', { default: 'X' });
    expect(fieldOf(next, 'purpose')).not.toHaveProperty('default');
  });
});

describe('retireField / restoreField', () => {
  it('should retire a built-in rather than delete it', () => {
    const next = retireField(resolveTemplate([]), 'operator');
    expect(fieldOf(next, 'operator').retired).toBe(true);
    expect(next).toHaveLength(3);
  });

  it('should restore a retired field', () => {
    const retired = retireField(resolveTemplate([]), 'operator');
    const back = restoreField(retired, 'operator');
    // The flag must be absent, not false: a stored `retired: false` reads as
    // an explicit statement about the field's history.
    expect(fieldOf(back, 'operator')).not.toHaveProperty('retired');
    expect(activeFields(back).map((f) => f.key)).toContain('operator');
  });
});

describe('deleteField', () => {
  it('should delete a user-defined field', () => {
    const { fields } = addField([], '样品编号');
    expect(deleteField(fields, 'u-field')).toHaveLength(0);
  });

  it('should refuse to delete a built-in', () => {
    // Its key is on every record the app has written; there would be nothing
    // left to label that column with. Retirement is the supported route.
    expect(() => deleteField(resolveTemplate([]), 'experiment')).toThrow();
  });

  it('should ignore an unknown key', () => {
    const fields = resolveTemplate([]);
    expect(deleteField(fields, 'nope')).toEqual(fields);
  });
});

describe('moveField', () => {
  const template = resolveTemplate([
    { key: 'u-a', label: { zh: 'A' } },
    { key: 'u-b', label: { zh: 'B' } },
    { key: 'u-c', label: { zh: 'C' } },
  ]);

  it('should move a user field earlier', () => {
    const next = moveField(template, 'u-c', -1);
    expect(next.map((f) => f.key)).toEqual(
      ['experiment', 'purpose', 'operator', 'u-a', 'u-c', 'u-b'],
    );
  });

  it('should move a user field later', () => {
    const next = moveField(template, 'u-a', 1);
    expect(next.map((f) => f.key)).toEqual(
      ['experiment', 'purpose', 'operator', 'u-b', 'u-a', 'u-c'],
    );
  });

  it('should not move a built-in', () => {
    // The built-in order is the order every previous export wrote columns in.
    expect(moveField(template, 'experiment', 1)).toBe(template);
  });

  it('should not move past the ends', () => {
    expect(moveField(template, 'u-a', -1).map((f) => f.key)).toEqual(template.map((f) => f.key));
    expect(moveField(template, 'u-c', 1).map((f) => f.key)).toEqual(template.map((f) => f.key));
  });
});

describe('loadTemplate', () => {
  it('should return an empty list when nothing is stored', () => {
    expect(loadTemplate(memoryStore())).toEqual([]);
  });

  it('should read back what saveTemplate wrote', () => {
    const store = memoryStore();
    const { fields } = addField([], '样品编号');
    saveTemplate(store, fields);
    const back = loadTemplate(store);
    expect(back).toHaveLength(1);
    expect(back[0].label.zh).toBe('样品编号');
  });

  it('should survive a corrupted value', () => {
    const store = memoryStore({ [TEMPLATE_KEY]: '{not json' });
    expect(loadTemplate(store)).toEqual([]);
  });

  it('should survive a store that throws', () => {
    const throwing = { getItem: () => { throw new Error('quota'); }, setItem: () => {} };
    expect(loadTemplate(throwing)).toEqual([]);
  });
});

describe('saveTemplate', () => {
  it('should not store a copy of an unmodified built-in', () => {
    // The built-ins are code. Storing them would freeze them at the version
    // that wrote them, and a later release could not reword a label.
    const store = memoryStore();
    const saved = saveTemplate(store, resolveTemplate([]));
    expect(saved).toEqual([]);
    expect(loadTemplate(store)).toEqual([]);
  });

  it('should store an override the user actually made', () => {
    const store = memoryStore();
    const fields = updateField(resolveTemplate([]), 'experiment', {
      label: { zh: '实验编号', en: '' },
    });
    saveTemplate(store, fields);
    expect(loadTemplate(store)[0].label.zh).toBe('实验编号');
  });

  it('should store a retirements the user made', () => {
    const store = memoryStore();
    saveTemplate(store, retireField(resolveTemplate([]), 'operator'));
    expect(loadTemplate(store)[0].retired).toBe(true);
  });

  it('should not throw when the store refuses the write', () => {
    // Losing the template costs a re-entry. Throwing here would take the
    // record the user was annotating down with it.
    const throwing = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(() => saveTemplate(throwing, resolveTemplate([]))).not.toThrow();
  });

  it('should write a versioned envelope so a format change has something to read', () => {
    const store = memoryStore();
    saveTemplate(store, addField([], 'X').fields);
    expect(JSON.parse(store.getItem(TEMPLATE_KEY)).version).toBe(1);
  });
});

describe('templateJson', () => {
  it('should be stable across two calls with the same content', () => {
    const fields = resolveTemplate([{ key: 'u-a', label: { zh: 'A' } }]);
    expect(templateJson(fields)).toBe(templateJson(fields));
  });

  it('should ignore property order', () => {
    const a = [{ key: 'u-a', type: 'text', label: { zh: 'A' }, default: 'x' }];
    const b = [{ default: 'x', label: { zh: 'A' }, type: 'text', key: 'u-a' }];
    expect(templateJson(resolveTemplate(a))).toBe(templateJson(resolveTemplate(b)));
  });

  it('should distinguish a real change', () => {
    const a = resolveTemplate([{ key: 'u-a', label: { zh: 'A' } }]);
    const b = resolveTemplate([{ key: 'u-a', label: { zh: 'B' } }]);
    expect(templateJson(a)).not.toBe(templateJson(b));
  });
});

describe('BUILTIN_FIELDS', () => {
  it('should keep the three keys every stored record points at', () => {
    expect(BUILTIN_FIELDS.map((f) => f.key)).toEqual(['experiment', 'purpose', 'operator']);
  });

  it('should mark them as built in so the UI can refuse to delete them', () => {
    for (const f of BUILTIN_FIELDS) expect(f.builtin, f.key).toBe(true);
  });
});
