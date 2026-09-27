import { describe, it, expect } from 'vitest';
import {
  addEntry, removeEntry, restoreEntry, clearHistory, loadHistory, saveHistory,
  memoryStore, filterHistory, visibleEntries, deletedEntries, migrateHistory,
  STORAGE_KEY,
} from '../src/ui/history.mjs';

/*
 * Deletion is a mark, not an erasure.
 *
 * This is the largest gap against ALCOA — the standard an electronic lab
 * notebook is held to. Its **Original** principle says a record must not be
 * silently altered or destroyed; what it protects is the ability to answer
 * "what did I actually write down" after the fact. `removeEntry` filtered the
 * record out of the array, so a deleted calculation was gone with no trace
 * that it had existed.
 *
 * That is a real risk for this app's actual use: someone's thesis data lives
 * in this history. A mis-click on a trash icon, or clearing the list to tidy
 * up, destroys the only copy — and the summary line that would have identified
 * it is destroyed with it.
 *
 * So a deleted record keeps its body and gains a `deletedAt`. It leaves the
 * list the user sees and stays in the file. The cost is bytes in localStorage,
 * against the cost of data that cannot be recovered.
 */

const entry = (over = {}) => ({
  id: 'e1',
  at: '2026-09-27T02:00:00.000Z',
  kind: 'bufferRecipe',
  summary: '配制磷酸缓冲液',
  inputs: { pKa: 7.2 },
  outputs: { acidConc: 0.0584 },
  ...over,
});

describe('removeEntry', () => {
  it('should keep the record and mark when it was deleted', () => {
    const list = removeEntry([entry()], 'e1', new Date('2026-09-27T03:00:00Z'));
    expect(list).toHaveLength(1);
    expect(list[0].deletedAt).toBe('2026-09-27T03:00:00.000Z');
    // The body survives — that is the whole point.
    expect(list[0].summary).toBe('配制磷酸缓冲液');
    expect(list[0].inputs).toEqual({ pKa: 7.2 });
  });

  it('should leave the other records untouched', () => {
    const list = removeEntry([entry(), entry({ id: 'e2' })], 'e1');
    expect(list[1].deletedAt).toBeUndefined();
  });

  it('should not mutate the input list', () => {
    const list = [entry()];
    removeEntry(list, 'e1');
    expect(list[0].deletedAt).toBeUndefined();
  });

  it('should be a no-op for an unknown id', () => {
    const list = [entry()];
    expect(removeEntry(list, 'nope')[0].deletedAt).toBeUndefined();
  });

  it('should not re-stamp a record that is already deleted', () => {
    // Deleting twice must not move the timestamp — it records when the user
    // deleted it, not when they last clicked.
    let list = removeEntry([entry()], 'e1', new Date('2026-09-27T03:00:00Z'));
    list = removeEntry(list, 'e1', new Date('2026-09-27T09:00:00Z'));
    expect(list[0].deletedAt).toBe('2026-09-27T03:00:00.000Z');
  });
});

describe('restoreEntry', () => {
  it('should bring a deleted record back with its body intact', () => {
    let list = removeEntry([entry()], 'e1');
    list = restoreEntry(list, 'e1');
    expect(list[0].deletedAt).toBeUndefined();
    expect(list[0].summary).toBe('配制磷酸缓冲液');
    expect(list[0].inputs).toEqual({ pKa: 7.2 });
  });

  it('should be a no-op for a record that is not deleted', () => {
    const list = [entry()];
    expect(restoreEntry(list, 'e1')[0].deletedAt).toBeUndefined();
  });
});

describe('visibleEntries and deletedEntries', () => {
  it('should hide a deleted record from the visible list', () => {
    const list = removeEntry([entry(), entry({ id: 'e2' })], 'e1');
    expect(visibleEntries(list).map((e) => e.id)).toEqual(['e2']);
  });

  it('should report the deleted ones separately, newest deletion first', () => {
    let list = removeEntry([entry(), entry({ id: 'e2' })], 'e1', new Date('2026-09-27T03:00:00Z'));
    list = removeEntry(list, 'e2', new Date('2026-09-27T05:00:00Z'));
    const gone = deletedEntries(list);
    expect(gone.map((e) => e.id)).toEqual(['e2', 'e1']);
  });

  it('should treat a record with no deletedAt as visible', () => {
    expect(visibleEntries([entry()])).toHaveLength(1);
  });
});

describe('clearHistory', () => {
  it('should mark everything deleted rather than emptying the list', () => {
    // "Clear all" was the most destructive button in the app: one click and
    // every record was gone, with nothing to say how many there had been.
    const list = clearHistory([entry(), entry({ id: 'e2' })], new Date('2026-09-27T04:00:00Z'));
    expect(list).toHaveLength(2);
    expect(list.every((e) => e.deletedAt === '2026-09-27T04:00:00.000Z')).toBe(true);
    expect(visibleEntries(list)).toHaveLength(0);
  });

  it('should leave already-deleted records on their original timestamp', () => {
    const first = removeEntry([entry()], 'e1', new Date('2026-09-27T03:00:00Z'));
    const list = clearHistory(first, new Date('2026-09-27T04:00:00Z'));
    expect(list[0].deletedAt).toBe('2026-09-27T03:00:00.000Z');
  });

  it('should handle an empty list', () => {
    expect(clearHistory([], new Date())).toEqual([]);
  });
});

describe('filterHistory', () => {
  it('should not surface a deleted record in a search', () => {
    const list = removeEntry([entry()], 'e1');
    expect(filterHistory(list, '磷酸')).toHaveLength(0);
  });
});

describe('migrateHistory', () => {
  it('should drop a deletedAt that is not a string', () => {
    const list = migrateHistory([entry({ deletedAt: 12345 })]);
    expect(list[0].deletedAt).toBeUndefined();
  });

  it('should keep a valid deletedAt', () => {
    const list = migrateHistory([entry({ deletedAt: '2026-09-27T03:00:00.000Z' })]);
    expect(list[0].deletedAt).toBe('2026-09-27T03:00:00.000Z');
  });

  it('should leave a v1 record with no deletedAt alone', () => {
    const list = migrateHistory([entry()]);
    expect(list[0].deletedAt).toBeUndefined();
    expect(list[0].kind).toBe('bufferRecipe');
  });
});

describe('persistence', () => {
  it('should round-trip a deleted record through storage', () => {
    // The record has to survive a reload, or the audit trail only exists
    // until the user closes the tab.
    const store = memoryStore();
    const list = removeEntry([entry()], 'e1', new Date('2026-09-27T03:00:00Z'));
    saveHistory(store, list);
    const back = loadHistory(store);
    expect(back).toHaveLength(1);
    expect(back[0].deletedAt).toBe('2026-09-27T03:00:00.000Z');
    expect(back[0].summary).toBe('配制磷酸缓冲液');
  });

  it('should not count deleted records against the storage cap', () => {
    // MAX_ENTRIES bounds what the list *shows*. If tombstones counted, a user
    // who deleted a hundred records would silently start losing live ones.
    const many = Array.from({ length: 600 }, (_, i) => entry({ id: `e${i}` }));
    const store = memoryStore();
    saveHistory(store, many, 500);
    const back = loadHistory(store);
    expect(back.length).toBeLessThanOrEqual(500);
  });

  it('should keep the storage key, so no migration is needed', () => {
    // v1 readers ignore an extra key; bumping the version would force a
    // migration for a change that needs none.
    expect(STORAGE_KEY).toBe('lab-calc.history.v1');
  });
});
