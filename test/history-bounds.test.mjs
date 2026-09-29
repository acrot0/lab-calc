import { describe, it, expect } from 'vitest';
import {
  addEntry, removeEntry, clearHistory, saveHistory, loadHistory,
  memoryStore, MAX_ENTRIES, MAX_TOMBSTONES,
} from '../src/ui/history.mjs';

/*
 * Bounds on the deleted records, and the promise that a rejected write is
 * visible to the caller.
 *
 * Two things are held here, both of which were wrong:
 *
 * 1. **Tombstones had no bound.** They were kept without limit on the
 *    argument that they are small. Measured: 381 bytes each, one per visible
 *    record per "clear all". Ten clears reached 2 MB against a ~5 MB quota —
 *    the deleted records, which the user believes are gone, were on course to
 *    become the thing that stops new ones being saved.
 *
 * 2. **`addEntry` dropped them anyway, on a different rule.** It sliced the
 *    whole array against `MAX_ENTRIES`, so 500 visible records plus any
 *    deletion history meant every tombstone vanished on the next calculation.
 *    The trash emptied, "restore" had nothing to restore, and the backup
 *    export carried none of what it exists to carry. Nothing errored.
 *
 * The two counts must stay independent: bounding one must never move the
 * other. That is what most of these tests assert.
 */

const live = (n) => Array.from({ length: n }, (_, i) => ({
  id: `L${i}`, kind: 'weigh', at: '2026-09-29T00:00:00.000Z',
}));

/** Tombstones whose `deletedAt` ascends with `i`, so "newest" is the tail. */
const dead = (n, from = 0) => Array.from({ length: n }, (_, i) => ({
  id: `D${i}`,
  kind: 'weigh',
  at: '2026-09-01T00:00:00.000Z',
  deletedAt: new Date(Date.UTC(2026, 8, 1 + from + i)).toISOString(),
}));

describe('tombstone cap', () => {
  it('should keep at most MAX_TOMBSTONES deleted records', () => {
    const store = memoryStore();
    saveHistory(store, dead(MAX_TOMBSTONES + 200));
    expect(loadHistory(store)).toHaveLength(MAX_TOMBSTONES);
  });

  it('should keep the most recently deleted ones', () => {
    // The tombstone a user is about to want back is the one they deleted a
    // moment ago, not one from months ago.
    const store = memoryStore();
    const list = dead(MAX_TOMBSTONES + 50);
    saveHistory(store, list);
    const kept = loadHistory(store).map((e) => e.deletedAt).sort();
    const expected = list.map((e) => e.deletedAt).sort().slice(-MAX_TOMBSTONES);
    expect(kept).toEqual(expected);
  });

  it('should not trim live records when there are too many tombstones', () => {
    // The whole point of two independent counts. A cap on deleted records that
    // ate live ones would be the same class of bug it exists to fix.
    const store = memoryStore();
    saveHistory(store, [...live(10), ...dead(MAX_TOMBSTONES + 100)]);
    const back = loadHistory(store);
    expect(back.filter((e) => !e.deletedAt)).toHaveLength(10);
    expect(back.filter((e) => e.deletedAt)).toHaveLength(MAX_TOMBSTONES);
  });

  it('should not trim tombstones when there are too many live records', () => {
    const store = memoryStore();
    saveHistory(store, [...live(MAX_ENTRIES + 100), ...dead(20)]);
    const back = loadHistory(store);
    expect(back.filter((e) => !e.deletedAt)).toHaveLength(MAX_ENTRIES);
    expect(back.filter((e) => e.deletedAt)).toHaveLength(20);
  });
});

describe('addEntry and tombstones', () => {
  it('should keep tombstones when the live list is full', () => {
    // This is the defect: `slice(0, MAX_ENTRIES)` on the whole array dropped
    // every tombstone as soon as 500 live records existed.
    const after = addEntry([...live(MAX_ENTRIES), ...dead(100)], { kind: 'weigh' });
    expect(after.filter((e) => e.deletedAt)).toHaveLength(100);
  });

  it('should still bound the live list at MAX_ENTRIES', () => {
    const after = addEntry(live(MAX_ENTRIES), { kind: 'weigh' });
    expect(after.filter((e) => !e.deletedAt)).toHaveLength(MAX_ENTRIES);
  });

  it('should put the new record first', () => {
    const after = addEntry(live(3), { kind: 'weigh', summary: '新的' });
    expect(after[0].summary).toBe('新的');
    expect(after[0].id).toBeTruthy();
    expect(after[0].at).toBeTruthy();
  });

  it('should leave tombstone bounding to saveHistory', () => {
    // Two places trimming the same list is how the two counts drift apart.
    // `addEntry` bounds the visible list; the store bounds the deleted one.
    const after = addEntry(dead(MAX_TOMBSTONES + 40), { kind: 'weigh' });
    expect(after.filter((e) => e.deletedAt)).toHaveLength(MAX_TOMBSTONES + 40);
  });

  it('should drop null rows rather than keep them', () => {
    const after = addEntry([null, undefined, ...live(2)], { kind: 'weigh' });
    expect(after.every(Boolean)).toBe(true);
  });
});

describe('a full history across a save cycle', () => {
  it('should keep both bounds after add, save and reload', () => {
    // The end-to-end shape a real user reaches: a full list, a long deletion
    // history, and one more calculation.
    const store = memoryStore();
    saveHistory(store, [...live(MAX_ENTRIES), ...dead(MAX_TOMBSTONES + 80)]);
    const loaded = loadHistory(store);
    const grown = addEntry(loaded, { kind: 'weigh' });
    saveHistory(store, grown);

    const back = loadHistory(store);
    expect(back.filter((e) => !e.deletedAt)).toHaveLength(MAX_ENTRIES);
    expect(back.filter((e) => e.deletedAt)).toHaveLength(MAX_TOMBSTONES);
  });

  it('should survive clearHistory without losing the records', () => {
    // The delete path a user actually takes: the whole list is marked, so
    // every record becomes a tombstone at once. Bounding must keep them.
    const store = memoryStore();
    saveHistory(store, clearHistory(live(50), new Date('2026-09-29T05:00:00Z')));
    const back = loadHistory(store);
    expect(back).toHaveLength(50);
    expect(back.every((e) => e.deletedAt === '2026-09-29T05:00:00.000Z')).toBe(true);
  });
});

describe('saveHistory reports failure', () => {
  it('should return true when the write lands', () => {
    expect(saveHistory(memoryStore(), live(1))).toBe(true);
  });

  it('should return false when the store rejects the write', () => {
    // The caller has to check this. A rejected write is the one way the
    // feature's promise — every calculation is kept — breaks with nothing on
    // screen changing.
    const full = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(saveHistory(full, live(1))).toBe(false);
  });

  it('should return false rather than throw when the store is hostile', () => {
    const hostile = {
      getItem: () => { throw new Error('nope'); },
      setItem: () => { throw new Error('nope'); },
    };
    expect(() => saveHistory(hostile, live(1))).not.toThrow();
    expect(saveHistory(hostile, live(1))).toBe(false);
  });
});

describe('removeEntry against the cap', () => {
  it('should not resurrect a bounded-out tombstone', () => {
    // A record dropped by the tombstone cap cannot be restored later, and the
    // restore must not fabricate a body for it.
    const store = memoryStore();
    saveHistory(store, dead(MAX_TOMBSTONES + 10));
    const ids = loadHistory(store).map((e) => e.id);
    expect(ids).not.toContain('D0');
    expect(ids).toContain(`D${MAX_TOMBSTONES + 9}`);
  });

  it('should still mark a freshly deleted record', () => {
    const marked = removeEntry(live(1), 'L0', new Date('2026-09-29T06:00:00Z'));
    expect(marked[0].deletedAt).toBe('2026-09-29T06:00:00.000Z');
  });
});
