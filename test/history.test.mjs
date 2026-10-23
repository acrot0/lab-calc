import { describe, it, expect } from 'vitest';
import {
  memoryStore,
  resolveStore,
  loadHistory,
  saveHistory,
  addEntry,
  removeEntry,
  clearHistory,
  visibleEntries,
  filterHistory,
  setEntryNote,
  noteTags, allNoteTags, filterByTags,
  MAX_NOTE_LENGTH,
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
  /*
   * These three asserted the destructive behaviour and are rewritten rather
   * than deleted: the operation changed from "erase" to "mark", and the old
   * assertions were pinning the data-loss bug that `test/audit-trail.test.mjs`
   * now covers in full. Kept here so the shape of the change is visible at the
   * place it happened.
   */
  it('should mark the record deleted rather than removing it', () => {
    const list = addEntry(addEntry([], entry('a')), entry('b'));
    const out = removeEntry(list, list[0].id);
    // Both records are still in the list; one carries a tombstone.
    expect(out).toHaveLength(2);
    expect(out[0].deletedAt).toBeTruthy();
    expect(visibleEntries(out).map((e) => e.kind)).toEqual(['a']);
  });

  it('should ignore an unknown id', () => {
    const list = [entry()];
    const out = removeEntry(list, 'nope');
    expect(out).toHaveLength(1);
    expect(out[0].deletedAt).toBeUndefined();
  });

  it('should mark everything on clear, keeping the records', () => {
    const list = [entry('a'), entry('b')];
    const out = clearHistory(list);
    expect(out).toHaveLength(2);
    expect(visibleEntries(out)).toEqual([]);
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

  it('should match a record by its free-text note', () => {
    // The note is the one field a user writes in their own words; searching
    // for those words is the whole reason it is searchable.
    const noted = { ...entry('massForMolarity'), note: 'cloudy, filtered before making up' };
    expect(filterHistory([noted, entry('dilution')], 'cloudy')).toEqual([noted]);
  });
});

describe('setEntryNote', () => {
  const withId = (id, note) => ({
    id, kind: 'massForMolarity', inputs: {}, outputs: {}, summary: 's', ...(note !== undefined ? { note } : {}),
  });

  it('should write a note on the named record and no other', () => {
    const list = [withId('a'), withId('b')];
    const out = setEntryNote(list, 'a', '溶液浑浊，过滤后定容');
    expect(out[0].note).toBe('溶液浑浊，过滤后定容');
    expect(out[1].note).toBeUndefined();
    // The input list is untouched, as every setter here promises.
    expect(list[0].note).toBeUndefined();
  });

  it('should remove the key entirely when the note is emptied', () => {
    const out = setEntryNote([withId('a', 'old')], 'a', '   ');
    expect('note' in out[0]).toBe(false);
  });

  it('should trim trailing whitespace and cap the length', () => {
    const out = setEntryNote([withId('a')], 'a', `x${' '.repeat(10)}`);
    expect(out[0].note).toBe('x');
    const long = setEntryNote([withId('a')], 'a', 'a'.repeat(MAX_NOTE_LENGTH + 50));
    expect(long[0].note).toHaveLength(MAX_NOTE_LENGTH);
  });

  it('should not add a note key to a record that had none and got none', () => {
    const out = setEntryNote([withId('a')], 'a', '');
    expect('note' in out[0]).toBe(false);
  });

  it('should survive a missing id or a null list', () => {
    expect(setEntryNote([withId('a')], null, 'x')).toHaveLength(1);
    expect(setEntryNote(null, 'a', 'x')).toEqual([]);
  });
});

describe('note tags', () => {
  const note = '溶液浑浊 #失败 过滤后重做 #重做 ；换了一批 #试剂';

  it('should read tags in order of first appearance, without duplicates', () => {
    expect(noteTags(note)).toEqual(['失败', '重做', '试剂']);
    expect(noteTags('#a #a #a')).toEqual(['a']);
  });

  it('should stop a tag at whitespace or a CJK ideograph', () => {
    // Within Chinese prose a tag runs until punctuation — there are no spaces
    // to stop it — and #失败已处理 reads as one three-character tag, the same
    // way a long English hashtag does. That is the convention, not a bug.
    expect(noteTags('#失败已处理')).toEqual(['失败已处理']);
    expect(noteTags('#done next')).toEqual(['done']);
  });

  it('should refuse tags with no word character', () => {
    expect(noteTags('# ## !!!')).toEqual([]);
    expect(noteTags('')).toEqual([]);
    expect(noteTags(undefined)).toEqual([]);
  });

  it('should count tags across records, most used first', () => {
    const entries = [
      { note: '#a #b' },
      { note: '#a' },
      { note: '#b #c' },
      { note: 'no tags' },
    ];
    expect(allNoteTags(entries)).toEqual([
      { tag: 'a', count: 2 },
      { tag: 'b', count: 2 },
      { tag: 'c', count: 1 },
    ]);
  });

  it('should AND the selected tags when filtering', () => {
    const entries = [
      { id: '1', note: '#失败 #重做' },
      { id: '2', note: '#失败' },
      { id: '3', note: '#重做' },
      { id: '4', note: '' },
    ];
    expect(filterByTags(entries, ['失败']).map((e) => e.id)).toEqual(['1', '2']);
    expect(filterByTags(entries, ['失败', '重做']).map((e) => e.id)).toEqual(['1']);
    expect(filterByTags(entries, [])).toHaveLength(4);
    expect(filterByTags(entries, null)).toHaveLength(4);
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
    for (const kind of [
      'massForMolarity', 'stockFromSolid', 'dilution', 'bufferRecipe', 'dilutionSeries',
      'phCalc', 'percentSolution', 'titrationCurve', 'reagent', 'spectro',
      'lab', 'colligative', 'reaction', 'electro',
    ]) {
      expect(KIND_TO_TAB[kind], `${kind} must have a tab`).toBeTruthy();
    }
  });
});
