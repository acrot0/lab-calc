/**
 * Experiment groups: which run a record belonged to.
 *
 * ## Why this is separate from the history list
 *
 * A record says what was calculated. A group says which experiment it was part
 * of, and that is the difference between a list of dilutions and a thesis
 * chapter. The plan calls this the real moat — every competing calculator
 * forgets the calculation, and a list that remembers 200 of them without
 * saying which run they came from has only half solved the problem.
 *
 * ## Why a second storage key
 *
 * `lab-calc.history.v1` has been an array since the first release, and every
 * export, import and backup in the wild is shaped that way. Wrapping it in an
 * object to add one feature would invalidate all of them, and the migration
 * would have to be right on the first try for users who never read a changelog.
 * A second key costs one more `localStorage` entry and no migration at all.
 *
 * The link is a `groupId` on the record, not a list of record ids on the group.
 * A record belongs to one experiment; a group holds many records. Storing the
 * many side on the group means every assign, unassign and delete has to edit
 * two places, and the two can disagree.
 *
 * ## What removing a group does
 *
 * It orphans its records — the label goes, the data stays. Deleting a group is
 * not deleting the experiment's results, and a UI that did the second when the
 * user asked for the first is the silent data loss the audit trail exists to
 * prevent. The records reappear under "未分组", where they can be refiled.
 *
 * Pure functions, no I/O beyond the two store helpers.
 */

/** Where the group list lives. Versioned like the history key, for the same reason. */
export const GROUP_KEY = 'lab-calc.groups.v1';

/** A cap, because an unbounded list eventually fails every write. */
export const MAX_GROUPS = 200;

/** Long enough for "第三章 磷酸缓冲液 pH 7.4 的配制与标定", short enough for a chip. */
export const MAX_GROUP_NAME = 80;

/*
 * Long enough for a paragraph of method notes. Not exported: the limit is
 * enforced where the note is stored, and a caller that needs to know it can
 * read the stored value back.
 */
const MAX_GROUP_NOTE = 2000;

/** The filter value meaning "no group" — a bucket, not the absence of a filter. */
export const UNGROUPED = 'ungrouped';

/** The filter value meaning "do not filter". */
export const ALL_GROUPS = 'all';

/**
 * Clean a stored list into the shape this module guarantees.
 *
 * Everything that reaches the UI goes through here: a group with no name
 * renders as a blank row indistinguishable from any other, two groups sharing
 * an id make `groupById` arbitrary, and a name of unbounded length breaks the
 * chip layout. Each of those is a corrupt or hand-edited file, and none of them
 * should be able to take the panel down.
 */
export function migrateGroups(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const g of raw) {
    if (!g || typeof g !== 'object' || Array.isArray(g)) continue;
    const id = typeof g.id === 'string' && g.id.trim() !== '' ? g.id : null;
    const name = typeof g.name === 'string' ? g.name.trim().slice(0, MAX_GROUP_NAME) : '';
    if (!id || name === '') continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const createdAt = typeof g.createdAt === 'string' && !Number.isNaN(Date.parse(g.createdAt))
      ? g.createdAt
      : new Date().toISOString();
    const note = typeof g.note === 'string' ? g.note.slice(0, MAX_GROUP_NOTE) : '';
    // Declared fields only. An undeclared one would export as a column nothing
    // can label — the same rule the record metadata follows.
    out.push({ id, name, note, createdAt });
    if (out.length >= MAX_GROUPS) break;
  }
  return out;
}

/** Read the group list. Never throws: a corrupt value reads as no groups. */
export function loadGroups(store) {
  try {
    return migrateGroups(JSON.parse(store.getItem(GROUP_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

/** Persist the group list. Returns false when the store refused the write. */
export function saveGroups(store, groups) {
  try {
    store.setItem(GROUP_KEY, JSON.stringify(migrateGroups(groups)));
    return true;
  } catch {
    return false;
  }
}

/** A stable id that does not collide with a second group made in the same ms. */
function nextId(existing) {
  const taken = new Set(existing.map((g) => g.id));
  for (;;) {
    const id = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    if (!taken.has(id)) return id;
  }
}

/**
 * Add a group.
 *
 * Returns `{ groups, group }` with `group` null when the name is blank or the
 * cap is reached — the caller has to be able to tell "made one" from "did not",
 * because it needs an id to select the new group.
 */
export function createGroup(groups, name, now = new Date()) {
  const list = groups ?? [];
  const clean = String(name ?? '').trim().slice(0, MAX_GROUP_NAME);
  if (clean === '' || list.length >= MAX_GROUPS) return { groups: list, group: null };
  const group = { id: nextId(list), name: clean, note: '', createdAt: now.toISOString() };
  return { groups: [...list, group], group };
}

/** Rename, keeping the id and the creation time. A blank name is refused. */
export function renameGroup(groups, id, name) {
  const clean = String(name ?? '').trim().slice(0, MAX_GROUP_NAME);
  if (clean === '') return groups ?? [];
  return (groups ?? []).map((g) => (g.id === id ? { ...g, name: clean } : g));
}

/** Set the group's method note. Empty is allowed — it clears the note. */
export function setGroupNote(groups, id, note) {
  const clean = String(note ?? '').slice(0, MAX_GROUP_NOTE);
  return (groups ?? []).map((g) => (g.id === id ? { ...g, note: clean } : g));
}

/**
 * Remove a group and orphan its records.
 *
 * Returns both lists because both change. The records keep their data and lose
 * only the link — see the note at the top of the file for why this is not a
 * cascade delete.
 */
export function removeGroup(groups, id, entries) {
  return {
    groups: (groups ?? []).filter((g) => g.id !== id),
    entries: (entries ?? []).map((e) => {
      if (!e || e.groupId !== id) return e;
      const { groupId: _drop, ...rest } = e;
      return rest;
    }),
  };
}

/** Put one record in a group, or take it out when `groupId` is null. */
export function assignGroup(entries, id, groupId) {
  return (entries ?? []).map((e) => {
    if (!e || e.id !== id) return e;
    if (groupId === null || groupId === undefined || groupId === '') {
      const { groupId: _drop, ...rest } = e;
      return rest;
    }
    return { ...e, groupId };
  });
}

/**
 * The records matching a filter.
 *
 * `null` and `'all'` both mean everything, so a caller that has not wired the
 * control up yet does not accidentally filter. `'ungrouped'` is a real bucket:
 * a record with no group is not "in group undefined", it is what a user looks
 * for when they want to find what they have not filed.
 */
export function filterByGroup(entries, filter) {
  const list = (entries ?? []).filter(Boolean);
  if (filter === null || filter === undefined || filter === ALL_GROUPS) return list;
  if (filter === UNGROUPED) return list.filter((e) => !e.groupId);
  return list.filter((e) => e.groupId === filter);
}

/** How many records each group holds, by group id. */
export function groupCounts(entries) {
  const out = {};
  for (const e of entries ?? []) {
    if (!e || !e.groupId) continue;
    out[e.groupId] = (out[e.groupId] ?? 0) + 1;
  }
  return out;
}

/** How many records have no group. */
export function ungroupedCount(entries) {
  return (entries ?? []).filter((e) => e && !e.groupId).length;
}

/** The group with this id, or null. Null rather than undefined so the caller's
 *  ungrouped branch is the same branch. */
export function groupById(groups, id) {
  if (!id) return null;
  return (groups ?? []).find((g) => g.id === id) ?? null;
}

/** The records in one group. */
export function entriesInGroup(entries, id) {
  return (entries ?? []).filter((e) => e && e.groupId === id);
}
