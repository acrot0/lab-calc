import { describe, it, expect } from 'vitest';
import {
  addEntry, loadHistory, saveHistory, memoryStore, setEntryMeta, filterHistory,
  META_FIELDS, STORAGE_KEY, migrateHistory,
} from '../src/ui/history.mjs';

/*
 * Record metadata — "which experiment is this, and what is it for".
 *
 * The user's words: 「让用户自定义——填入哪个实验号、做什么用的」. Every record the
 * app writes is anonymous: a timestamp, a kind, a summary. That is enough to
 * find a calculation again, and not enough to answer the question a lab
 * notebook exists to answer — which experiment was this part of, and why.
 *
 * So each record can carry a small, fixed set of user-supplied fields. Fixed
 * rather than free-form, because the whole value of a field is that it can be
 * filtered and exported as a column; a free-text blob cannot be either, and
 * that is what the summary line already is.
 *
 * The fields live beside the record rather than inside `inputs`, because
 * `inputs` is what gets replayed into a tab — a field that is not an input to
 * the calculation must not be fed back as one.
 */

const entry = (over = {}) => ({
  id: 'e1',
  at: '2026-09-27T02:00:00.000Z',
  kind: 'bufferRecipe',
  summary: '配制 0.1 mol/L 磷酸缓冲液 pH 7.2',
  inputs: { pKa: 7.2, targetPh: 7.2, totalConc: 0.1 },
  outputs: { acidConc: 0.0584, baseConc: 0.0416 },
  ...over,
});

describe('META_FIELDS', () => {
  it('should offer the fields a lab record actually needs', () => {
    const keys = META_FIELDS.map((f) => f.key);
    expect(keys).toContain('experiment');
    expect(keys).toContain('purpose');
    expect(keys).toContain('operator');
  });

  it('should give every field a label in both languages', () => {
    for (const f of META_FIELDS) {
      expect(f.label?.zh, `${f.key} zh`).toBeTruthy();
      expect(f.label?.en, `${f.key} en`).toBeTruthy();
    }
  });

  it('should cap the length so one field cannot bloat storage', () => {
    for (const f of META_FIELDS) {
      expect(f.maxLength, `${f.key}`).toBeGreaterThan(0);
      expect(f.maxLength).toBeLessThanOrEqual(200);
    }
  });
});

describe('setEntryMeta', () => {
  it('should attach metadata to one record without touching the others', () => {
    const list = [entry(), entry({ id: 'e2' })];
    const next = setEntryMeta(list, 'e1', { experiment: 'EXP-2026-14' });
    expect(next[0].meta.experiment).toBe('EXP-2026-14');
    expect(next[1].meta).toBeUndefined();
  });

  it('should merge rather than replace, so two fields can be set separately', () => {
    let list = setEntryMeta([entry()], 'e1', { experiment: 'EXP-1' });
    list = setEntryMeta(list, 'e1', { purpose: '标定' });
    expect(list[0].meta).toEqual({ experiment: 'EXP-1', purpose: '标定' });
  });

  it('should not mutate the input list', () => {
    const list = [entry()];
    setEntryMeta(list, 'e1', { experiment: 'X' });
    expect(list[0].meta).toBeUndefined();
  });

  it('should trim whitespace and drop a field cleared to empty', () => {
    // Clearing a field must remove the key, not store an empty string —
    // otherwise an exported column is blank-but-present, which reads as
    // "measured and empty" rather than "never filled in".
    let list = setEntryMeta([entry()], 'e1', { experiment: '  EXP-1  ' });
    expect(list[0].meta.experiment).toBe('EXP-1');
    list = setEntryMeta(list, 'e1', { experiment: '   ' });
    expect(list[0].meta).toBeUndefined();
  });

  it('should ignore a key that is not a declared field', () => {
    // An undeclared key would export as a column nothing can label.
    const list = setEntryMeta([entry()], 'e1', { nonsense: 'x' });
    expect(list[0].meta).toBeUndefined();
  });

  it('should truncate an over-long value rather than reject it', () => {
    // Rejecting would lose what the user typed; the cap is about storage
    // bounds, not about validation.
    const long = 'x'.repeat(500);
    const list = setEntryMeta([entry()], 'e1', { experiment: long });
    expect(list[0].meta.experiment.length).toBeLessThanOrEqual(200);
  });

  it('should leave the record alone when the id is unknown', () => {
    const list = [entry()];
    const next = setEntryMeta(list, 'nope', { experiment: 'X' });
    expect(next[0].meta).toBeUndefined();
  });
});

describe('migrateHistory', () => {
  it('should leave a v1 record readable and unchanged', () => {
    // v1 records have no `meta` and must keep working: they are the entire
    // history of every existing user.
    const v1 = [entry()];
    const out = migrateHistory(v1);
    expect(out[0].kind).toBe('bufferRecipe');
    expect(out[0].meta).toBeUndefined();
  });

  it('should keep a record that already has metadata', () => {
    const withMeta = [entry({ meta: { experiment: 'EXP-9' } })];
    expect(migrateHistory(withMeta)[0].meta).toEqual({ experiment: 'EXP-9' });
  });

  it('should drop metadata that is not an object', () => {
    // A hand-edited or corrupted file must not put a string where the UI
    // expects to read `.experiment`.
    const bad = [entry({ meta: 'EXP-9' })];
    expect(migrateHistory(bad)[0].meta).toBeUndefined();
  });

  it('should pass through an empty list', () => {
    expect(migrateHistory([])).toEqual([]);
  });
});

describe('loadHistory with metadata', () => {
  it('should read back what was written', () => {
    const store = memoryStore();
    const list = setEntryMeta(addEntry([], entry()), null, {});
    saveHistory(store, list);
    const back = loadHistory(store);
    expect(back[0].kind).toBe('bufferRecipe');
  });

  it('should normalise a record whose meta is the wrong shape', () => {
    const store = memoryStore({
      [STORAGE_KEY]: JSON.stringify([entry({ meta: 42 })]),
    });
    const back = loadHistory(store);
    expect(back[0].meta).toBeUndefined();
  });
});

describe('filterHistory with metadata', () => {
  it('should find a record by its experiment number', () => {
    // The point of a fixed field: it can be searched.
    const list = setEntryMeta([entry(), entry({ id: 'e2', summary: 'other' })], 'e1', {
      experiment: 'EXP-2026-14',
    });
    expect(filterHistory(list, 'EXP-2026-14')).toHaveLength(1);
    expect(filterHistory(list, 'exp-2026')).toHaveLength(1);
  });

  it('should find a record by its purpose', () => {
    const list = setEntryMeta([entry()], 'e1', { purpose: '毕业论文第三章' });
    expect(filterHistory(list, '毕业论文')).toHaveLength(1);
  });
});
