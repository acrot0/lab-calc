import { describe, it, expect } from 'vitest';
import {
  GROUP_KEY, MAX_GROUPS, MAX_GROUP_NAME,
  loadGroups, saveGroups, migrateGroups,
  createGroup, renameGroup, removeGroup, setGroupNote,
  entriesInGroup, groupCounts, ungroupedCount, groupById,
  assignGroup, filterByGroup,
} from '../src/ui/groups.mjs';
import { memoryStore } from '../src/ui/history.mjs';

/*
 * Experiment groups.
 *
 * The last piece of the ELN story: a record on its own says what was
 * calculated, and a *group* says which experiment it belonged to. Without it a
 * thesis chapter's worth of records is one flat list, and the only way to tell
 * which dilution belonged to which run is to read every one.
 *
 * The storage is a separate key rather than a wrapper around the history array,
 * because the history key has been an array since the first release and every
 * export, import and backup in the wild is shaped that way. Wrapping it to add
 * one feature would invalidate all of them.
 */

const store = (initial = {}) => memoryStore(initial);
const group = (id, name, at = '2026-09-27T10:00:00.000Z') => ({ id, name, note: '', createdAt: at });
const entry = (id, groupId) => ({ id, at: '2026-09-27T10:00:00.000Z', kind: 'dilution', inputs: {}, groupId });

describe('the group list', () => {
  it('should start empty', () => {
    expect(loadGroups(store())).toEqual([]);
  });

  it('should round-trip through storage', () => {
    const s = store();
    const list = [group('g1', '第三章 缓冲液'), group('g2', '预实验')];
    expect(saveGroups(s, list)).toBe(true);
    expect(loadGroups(s)).toEqual(list);
  });

  it('should survive a store that refuses to write', () => {
    // localStorage throws in Safari private mode and when the quota is full. A
    // calculator must still work, so the failure is reported and swallowed
    // rather than taking the app down.
    const s = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
    expect(saveGroups(s, [group('g1', 'x')])).toBe(false);
  });

  it('should not crash on a corrupt value', () => {
    expect(loadGroups(store({ [GROUP_KEY]: 'not json' }))).toEqual([]);
    expect(loadGroups(store({ [GROUP_KEY]: '{"not":"an array"}' }))).toEqual([]);
    expect(loadGroups(store({ [GROUP_KEY]: '[1,2,3]' }))).toEqual([]);
  });

  it('should drop a group with no usable name', () => {
    // A nameless group renders as an empty row that cannot be told from any
    // other, so it is not a group.
    const s = store({ [GROUP_KEY]: JSON.stringify([group('g1', ''), group('g2', 'ok')]) });
    expect(loadGroups(s).map((g) => g.id)).toEqual(['g2']);
  });

  it('should cap the list rather than let it grow without bound', () => {
    const many = Array.from({ length: MAX_GROUPS + 20 }, (_, i) => group(`g${i}`, `group ${i}`));
    const s = store();
    saveGroups(s, many);
    expect(loadGroups(s)).toHaveLength(MAX_GROUPS);
  });
});

describe('migrateGroups', () => {
  it('should return an empty list for anything that is not a list', () => {
    for (const bad of [null, undefined, 42, 'x', {}]) expect(migrateGroups(bad)).toEqual([]);
  });

  it('should keep only the declared fields', () => {
    // An undeclared field would export as a column nothing can label, the same
    // rule the record metadata follows.
    const [g] = migrateGroups([{ id: 'g1', name: 'x', evil: 'drop me' }]);
    expect(g).not.toHaveProperty('evil');
    expect(Object.keys(g).sort()).toEqual(['createdAt', 'id', 'name', 'note']);
  });

  it('should truncate a name rather than drop the group', () => {
    const long = 'x'.repeat(MAX_GROUP_NAME + 50);
    const [g] = migrateGroups([group('g1', long)]);
    expect(g.name).toHaveLength(MAX_GROUP_NAME);
  });

  it('should give a group with no timestamp one, so sorting is total', () => {
    const [g] = migrateGroups([{ id: 'g1', name: 'x' }]);
    expect(typeof g.createdAt).toBe('string');
    expect(Number.isNaN(Date.parse(g.createdAt))).toBe(false);
  });

  it('should drop duplicates by id', () => {
    // Two groups with one id means `groupById` picks arbitrarily and the UI
    // shows the same experiment twice.
    const out = migrateGroups([group('g1', 'first'), group('g1', 'second')]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('first');
  });
});

describe('createGroup', () => {
  it('should append and return the new group', () => {
    const { groups, group: g } = createGroup([], '第三章', new Date('2026-09-27T10:00:00Z'));
    expect(groups).toHaveLength(1);
    expect(g.name).toBe('第三章');
    expect(g.createdAt).toBe('2026-09-27T10:00:00.000Z');
    expect(groups[0].id).toBe(g.id);
  });

  it('should give every group a distinct id', () => {
    let list = [];
    for (let i = 0; i < 50; i++) list = createGroup(list, `g${i}`).groups;
    expect(new Set(list.map((g) => g.id)).size).toBe(50);
  });

  it('should trim the name and refuse an empty one', () => {
    expect(createGroup([], '  spaced  ').group.name).toBe('spaced');
    expect(createGroup([], '   ').group).toBeNull();
    expect(createGroup([], '').groups).toEqual([]);
  });

  it('should refuse to exceed the cap', () => {
    let list = [];
    for (let i = 0; i < MAX_GROUPS; i++) list = createGroup(list, `g${i}`).groups;
    const { group: extra, groups } = createGroup(list, 'one too many');
    expect(extra).toBeNull();
    expect(groups).toHaveLength(MAX_GROUPS);
  });
});

describe('renameGroup and setGroupNote', () => {
  it('should rename without touching the id or the timestamp', () => {
    const list = [group('g1', 'old')];
    const out = renameGroup(list, 'g1', 'new');
    expect(out[0].name).toBe('new');
    expect(out[0].id).toBe('g1');
    expect(out[0].createdAt).toBe(list[0].createdAt);
  });

  it('should refuse a blank rename rather than leaving a nameless group', () => {
    const list = [group('g1', 'keep me')];
    expect(renameGroup(list, 'g1', '  ')[0].name).toBe('keep me');
  });

  it('should store a note', () => {
    const out = setGroupNote([group('g1', 'x')], 'g1', 'pH 7.4 磷酸缓冲，室温');
    expect(out[0].note).toBe('pH 7.4 磷酸缓冲，室温');
  });

  it('should not mutate the input list', () => {
    const list = [group('g1', 'x')];
    const snapshot = JSON.stringify(list);
    renameGroup(list, 'g1', 'y');
    setGroupNote(list, 'g1', 'z');
    expect(JSON.stringify(list)).toBe(snapshot);
  });
});

describe('removeGroup', () => {
  it('should remove the group and orphan its records, not delete them', () => {
    /*
     * The decision this pins: deleting a group is not deleting its records.
     * A group is a label; the records are the data. Removing the label must
     * leave the data in the list, unlabelled — anything else is the silent
     * deletion the audit trail was built to stop.
     */
    const groups = [group('g1', 'x'), group('g2', 'y')];
    const entries = [entry('e1', 'g1'), entry('e2', 'g1'), entry('e3', 'g2')];
    const out = removeGroup(groups, 'g1', entries);
    expect(out.groups.map((g) => g.id)).toEqual(['g2']);
    expect(out.entries).toHaveLength(3);
    expect(out.entries.filter((e) => e.groupId === 'g1')).toHaveLength(0);
    expect(out.entries.find((e) => e.id === 'e1').groupId).toBeUndefined();
  });

  it('should leave other groups records alone', () => {
    const out = removeGroup([group('g1', 'x'), group('g2', 'y')], 'g1', [entry('e3', 'g2')]);
    expect(out.entries[0].groupId).toBe('g2');
  });
});

describe('assignGroup', () => {
  it('should set the group on one record', () => {
    const out = assignGroup([entry('e1'), entry('e2')], 'e1', 'g1');
    expect(out[0].groupId).toBe('g1');
    expect(out[1].groupId).toBeUndefined();
  });

  it('should clear the group when given null', () => {
    const out = assignGroup([entry('e1', 'g1')], 'e1', null);
    expect(out[0].groupId).toBeUndefined();
  });

  it('should not mutate the input', () => {
    const list = [entry('e1')];
    assignGroup(list, 'e1', 'g1');
    expect(list[0].groupId).toBeUndefined();
  });
});

describe('filterByGroup', () => {
  const entries = [entry('e1', 'g1'), entry('e2', 'g2'), entry('e3'), entry('e4', 'g1')];

  it('should return everything for the all filter', () => {
    expect(filterByGroup(entries, null)).toHaveLength(4);
    expect(filterByGroup(entries, 'all')).toHaveLength(4);
  });

  it('should return one group', () => {
    expect(filterByGroup(entries, 'g1').map((e) => e.id)).toEqual(['e1', 'e4']);
  });

  it('should return the ungrouped records for the ungrouped filter', () => {
    // A record with no group is not "in group undefined" — it is the bucket a
    // user looks in to find what they have not filed yet.
    expect(filterByGroup(entries, 'ungrouped').map((e) => e.id)).toEqual(['e3']);
  });

  it('should return nothing for a group that has no records', () => {
    expect(filterByGroup(entries, 'g9')).toEqual([]);
  });
});

describe('counts', () => {
  it('should count the records in each group', () => {
    const counts = groupCounts([entry('e1', 'g1'), entry('e2', 'g1'), entry('e3', 'g2')]);
    expect(counts).toEqual({ g1: 2, g2: 1 });
  });

  it('should count the ungrouped records', () => {
    expect(ungroupedCount([entry('e1', 'g1'), entry('e2'), entry('e3')])).toBe(2);
  });

  it('should not count a record that is not there', () => {
    // Nulls reach here from a corrupt file; counting them invents records.
    expect(ungroupedCount([null, entry('e1'), undefined])).toBe(1);
  });
});

describe('groupById', () => {
  it('should find a group', () => {
    expect(groupById([group('g1', 'x')], 'g1').name).toBe('x');
  });

  it('should return null for an unknown id rather than undefined', () => {
    // The caller renders this; `undefined.name` is a crash and `null` is a
    // branch that already has to exist for the ungrouped case.
    expect(groupById([group('g1', 'x')], 'nope')).toBeNull();
    expect(groupById([group('g1', 'x')], null)).toBeNull();
  });
});

describe('entriesInGroup', () => {
  it('should find the records of one group', () => {
    expect(entriesInGroup([entry('e1', 'g1'), entry('e2', 'g2')], 'g1').map((e) => e.id)).toEqual(['e1']);
  });
});
