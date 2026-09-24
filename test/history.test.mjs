import { describe, it, expect } from 'vitest';
import {
  memoryStore,
  resolveStore,
  loadHistory,
  saveHistory,
  addEntry,
  removeEntry,
  clearHistory,
  filterHistory,
  replayInputs,
  planReplay,
  KIND_TO_TAB,
  STORAGE_KEY,
  MAX_ENTRIES,
} from '../src/ui/history.mjs';

const entry = (kind = 'massForMolarity', inputs = {}) => ({
  kind,
  inputs,
  outputs: { massG: 1 },
  summary: `${kind} summary`,
});

describe('memoryStore', () => {
  it('should behave like a key-value store', () => {
    const s = memoryStore();
    expect(s.getItem('x')).toBeNull();
    s.setItem('x', '1');
    expect(s.getItem('x')).toBe('1');
  });

  it('should remove keys', () => {
    const s = memoryStore({ a: '1' });
    s.removeItem('a');
    expect(s.getItem('a')).toBeNull();
  });
});

describe('resolveStore', () => {
  it('should return the candidate when it works', () => {
    const s = memoryStore();
    expect(resolveStore(s)).toBe(s);
  });

  it('should fall back to memory when the store throws', () => {
    // Safari private mode and a full quota both throw here. The calculator
    // must keep working; only the history is lost.
    const hostile = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => {},
    };
    const s = resolveStore(hostile);
    expect(s).not.toBe(hostile);
    expect(() => s.setItem('a', 'b')).not.toThrow();
  });

  it('should fall back to memory when nothing is available', () => {
    expect(() => resolveStore(null)).not.toThrow();
  });
});

describe('loadHistory / saveHistory', () => {
  it('should round-trip a list', () => {
    const s = memoryStore();
    const list = [entry('dilution'), entry('massForMolarity')];
    saveHistory(s, list);
    expect(loadHistory(s)).toEqual(list);
  });

  it('should return an empty list when nothing is stored', () => {
    expect(loadHistory(memoryStore())).toEqual([]);
  });

  it('should survive corrupt JSON rather than throwing', () => {
    // A single bad write must not brick the app on every subsequent load.
    const s = memoryStore({ [STORAGE_KEY]: '{not json' });
    expect(loadHistory(s)).toEqual([]);
  });

  it('should drop malformed rows but keep the good ones', () => {
    const s = memoryStore({
      [STORAGE_KEY]: JSON.stringify([entry(), null, { nope: true }, entry('dilution')]),
    });
    const out = loadHistory(s);
    expect(out).toHaveLength(2);
    expect(out.every((e) => typeof e.kind === 'string')).toBe(true);
  });

  it('should ignore a stored value that is not an array', () => {
    const s = memoryStore({ [STORAGE_KEY]: JSON.stringify({ a: 1 }) });
    expect(loadHistory(s)).toEqual([]);
  });

  it('should report failure rather than throwing when saving is impossible', () => {
    const hostile = { getItem: () => null, setItem: () => { throw new Error('nope'); }, removeItem: () => {} };
    expect(saveHistory(hostile, [entry()])).toBe(false);
  });

  it('should cap the stored list', () => {
    const s = memoryStore();
    const many = Array.from({ length: MAX_ENTRIES + 50 }, (_, i) => entry('dilution', { i }));
    saveHistory(s, many);
    expect(loadHistory(s)).toHaveLength(MAX_ENTRIES);
  });
});

describe('addEntry', () => {
  it('should put the newest entry first', () => {
    const list = addEntry([entry('old')], entry('new'));
    expect(list[0].kind).toBe('new');
    expect(list).toHaveLength(2);
  });

  it('should stamp a timestamp and an id', () => {
    const [e] = addEntry([], entry(), new Date('2026-09-24T10:00:00Z'));
    expect(e.at).toBe('2026-09-24T10:00:00.000Z');
    expect(e.id).toBeTruthy();
  });

  it('should give two entries at the same millisecond distinct ids', () => {
    const t = new Date('2026-09-24T10:00:00Z');
    const a = addEntry([], entry(), t)[0];
    const b = addEntry([], entry(), t)[0];
    expect(a.id).not.toBe(b.id);
  });

  it('should not mutate the input list', () => {
    const list = [entry('a')];
    const copy = [...list];
    addEntry(list, entry('b'));
    expect(list).toEqual(copy);
  });

  it('should enforce the cap so storage cannot grow without bound', () => {
    let list = [];
    for (let i = 0; i < MAX_ENTRIES + 10; i++) list = addEntry(list, entry('x', { i }));
    expect(list).toHaveLength(MAX_ENTRIES);
    expect(list[0].inputs.i).toBe(MAX_ENTRIES + 9);
  });
});

describe('removeEntry / clearHistory', () => {
  it('should remove by id', () => {
    const list = addEntry(addEntry([], entry('a')), entry('b'));
    const out = removeEntry(list, list[0].id);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('a');
  });

  it('should ignore an unknown id', () => {
    const list = [entry()];
    expect(removeEntry(list, 'nope')).toHaveLength(1);
  });

  it('should clear everything', () => {
    expect(clearHistory()).toEqual([]);
  });
});

describe('filterHistory', () => {
  const list = [
    { ...entry('massForMolarity', { formula: 'NaCl' }), summary: '14.61 g of NaCl' },
    { ...entry('dilution', { formula: 'NaOH' }), summary: '10 mL stock' },
  ];

  it('should return everything for an empty query', () => {
    expect(filterHistory(list, '')).toHaveLength(2);
    expect(filterHistory(list, '   ')).toHaveLength(2);
  });

  it('should match the summary case-insensitively', () => {
    expect(filterHistory(list, 'nacl')).toHaveLength(1);
  });

  it('should match against the raw inputs, not just the summary', () => {
    // A user searches for what they typed, which may not appear in the summary.
    expect(filterHistory(list, 'NaOH')).toHaveLength(1);
  });

  it('should return an empty list when nothing matches', () => {
    expect(filterHistory(list, 'zzzz')).toEqual([]);
  });

  it('should not throw on entries with missing fields', () => {
    expect(() => filterHistory([{ kind: 'x' }], 'a')).not.toThrow();
  });
});

describe('replayInputs', () => {
  it('should hand back the stored inputs so a calculation can be re-run', () => {
    expect(replayInputs({ inputs: { formula: 'NaCl' } })).toEqual({ formula: 'NaCl' });
  });

  it('should return null for a record with no inputs', () => {
    expect(replayInputs({})).toBeNull();
    expect(replayInputs(null)).toBeNull();
  });
});

describe('planReplay', () => {
  it('should route each kind to the tab that owns it', () => {
    expect(planReplay({ kind: 'stockFromSolid', inputs: { formula: 'NaCl' } }))
      .toEqual({ tab: 'weigh', inputs: { formula: 'NaCl' } });
    expect(planReplay({ kind: 'dilution', inputs: { stockConc: 1 } }).tab).toBe('dilute');
    expect(planReplay({ kind: 'bufferRecipe', inputs: { pKa: 4.76 } }).tab).toBe('buffer');
    expect(planReplay({ kind: 'dilutionSeries', inputs: { factor: 10 } }).tab).toBe('series');
  });

  it('should return null for an unknown kind rather than navigating somewhere arbitrary', () => {
    expect(planReplay({ kind: 'mystery', inputs: { a: 1 } })).toBeNull();
  });

  it('should return null when there are no inputs to restore', () => {
    expect(planReplay({ kind: 'dilution' })).toBeNull();
    expect(planReplay(null)).toBeNull();
  });

  it('should cover every kind the calculators actually record', () => {
    // Guards against a new calculator being added without a replay route.
    for (const kind of ['massForMolarity', 'stockFromSolid', 'dilution', 'bufferRecipe', 'dilutionSeries']) {
      expect(KIND_TO_TAB[kind], `${kind} must have a tab`).toBeTruthy();
    }
  });
});
