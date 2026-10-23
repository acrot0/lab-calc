/**
 * The reagent inventory.
 *
 * ## Why this is not another calculation tab
 *
 * The calculators answer "how much"; the inventory answers "where is it and
 * is it still good" — the question r/labrats names most often when asked what
 * software they wish existed. Both live at the bench, but they are different
 * data: a calculation is immutable once made, while a container's record
 * changes every time it moves, opens, or empties. So the inventory is a
 * separate entity with its own storage key, not a `kind` on the history.
 *
 * ## The record shape follows container-level practice
 *
 * Inventory guides (CDC guidance, multi-site chemical-inventory checklists)
 * agree on the unit of record being the *container*, not the substance: name,
 * lot, location, opened-on, expiry, and a note. CAS and owner fields are
 * deliberately left out of v1 — a personal tool's user is the owner, and a
 * field that is never filled teaches the user to ignore the form.
 *
 * ## Expiry is computed, never stored
 *
 * `expired`/`expiring` are derived from `expiry` at read time, so the status
 * is true whenever it is read rather than whenever it was last written. A
 * record that stored "ok" and was read a year later would lie.
 */

export const INVENTORY_KEY = 'lab-calc.inventory.v1';

/** Storage bound, not validation. Matches MAX_ENTRIES' reasoning. */
export const MAX_ITEMS = 200;

/**
 * How many days ahead counts as "expiring soon".
 *
 * Exported for the tests and for a future dashboard; the status function is
 * the only runtime reader.
 */
export const EXPIRING_DAYS = 30;

/** A stand-in store, the same contract history and nav use. */
export function memoryStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

/** The same probe-based resolution the nav order uses. */
export function resolveStore(candidate) {
  try {
    const s = candidate ?? globalThis.localStorage;
    if (!s) return memoryStore();
    const probe = '__labcalc_inv_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return memoryStore();
  }
}

const MAX_TEXT = 80;
const MAX_NOTE = 300;

const clean = (s, max = MAX_TEXT) => String(s ?? '').trim().slice(0, max);

let seq = 0;
function newId(now = new Date()) {
  seq = (seq + 1) % 1000;
  return `inv-${now.getTime().toString(36)}-${seq.toString(36)}`;
}

/**
 * Read the stored inventory, dropping rows that lost their name — the one
 * field every display and export keys on. A corrupt row is skipped rather
 * than throwing, the same rule `loadHistory` follows.
 */
export function loadInventory(store) {
  let raw = null;
  try { raw = store?.getItem(INVENTORY_KEY); } catch { raw = null; }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x === 'object' && typeof x.name === 'string' && x.name.trim() !== '')
      .map((x) => ({
        id: typeof x.id === 'string' ? x.id : newId(),
        name: clean(x.name),
        lot: clean(x.lot),
        location: clean(x.location),
        openedAt: typeof x.openedAt === 'string' ? x.openedAt : '',
        expiry: typeof x.expiry === 'string' ? x.expiry : '',
        note: typeof x.note === 'string' ? x.note.trim().slice(0, MAX_NOTE) : '',
        createdAt: typeof x.createdAt === 'string' ? x.createdAt : new Date().toISOString(),
      }))
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

/** Persist. Returns false when the store refuses, the same contract as saveHistory. */
export function saveInventory(store, items) {
  try {
    store?.setItem(INVENTORY_KEY, JSON.stringify(items ?? []));
    return true;
  } catch {
    return false;
  }
}

/** Add a container. Newest first, capped. */
export function addItem(items, draft, now = new Date()) {
  const name = clean(draft?.name);
  if (!name) return items ?? [];
  const item = {
    id: newId(now),
    name,
    lot: clean(draft?.lot),
    location: clean(draft?.location),
    openedAt: draft?.openedAt || '',
    expiry: draft?.expiry || '',
    note: String(draft?.note ?? '').trim().slice(0, MAX_NOTE),
    createdAt: now.toISOString(),
  };
  return [item, ...(items ?? [])].slice(0, MAX_ITEMS);
}

/** Patch one container by id. Empty-name patches are refused. */
export function updateItem(items, id, patch) {
  return (items ?? []).map((x) => {
    if (!x || x.id !== id) return x;
    const next = { ...x };
    for (const key of ['name', 'lot', 'location', 'note']) {
      if (key in (patch ?? {})) next[key] = clean(patch[key], key === 'note' ? MAX_NOTE : MAX_TEXT);
    }
    for (const key of ['openedAt', 'expiry']) {
      if (key in (patch ?? {})) next[key] = patch[key] || '';
    }
    if (!next.name.trim()) return x;
    return next;
  });
}

/**
 * Remove a container — really remove, unlike history's tombstone.
 *
 * The audit trail exists so a calculation can be *replayed*; a container that
 * has left the lab has nothing to replay, and a list of dead bottles is the
 * clutter the feature exists to remove.
 */
export function removeItem(items, id) {
  return (items ?? []).filter((x) => x && x.id !== id);
}

/**
 * The days until `expiry`, or null when there is no date or it is unparseable.
 * Whole days, floor-bounded: "expires today" reads better than "0.4 days".
 */
export function daysLeft(iso, now = new Date()) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  // `now` may arrive as a Date or as epoch milliseconds — the timers module
  // speaks milliseconds and passing one straight through must keep working.
  const at = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(at)) return null;
  return Math.floor((t - at) / 86400000);
}

/**
 * The expiry status of one item.
 *
 * `ok` / `expiring` / `expired` / `none`. "none" is distinct from "ok"
 * because a container with no expiry date is not a claim that it lasts
 * forever — salt does, but so does an unlabelled bottle someone forgot.
 */
export function expiryStatus(item, now = new Date()) {
  const d = daysLeft(item?.expiry, now);
  if (d === null) return 'none';
  if (d < 0) return 'expired';
  if (d <= EXPIRING_DAYS) return 'expiring';
  return 'ok';
}

/** Sort for display: problems first, then newest. */
export function sortForDisplay(items, now = new Date()) {
  const rank = { expired: 0, expiring: 1, none: 2, ok: 3 };
  return [...(items ?? [])].sort((a, b) => {
    const ra = rank[expiryStatus(a, now)];
    const rb = rank[expiryStatus(b, now)];
    if (ra !== rb) return ra - rb;
    return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
  });
}

/** Case-insensitive search over every field a person would type. */
export function searchInventory(items, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return items ?? [];
  return (items ?? []).filter((x) => {
    const hay = [x?.name, x?.lot, x?.location, x?.note].join(' ').toLowerCase();
    return hay.includes(q);
  });
}
