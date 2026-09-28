/**
 * The order the user has put their tabs in.
 *
 * ## Why one list instead of two
 *
 * The phone shows five tabs plus a "more" panel; the desktop rail shows all
 * twenty. The obvious implementation is to store which five the bar shows and
 * leave the rest alone — but then the two navigations hold different opinions
 * about where a tab lives. A user who drags 分光光度 to the front on their phone
 * and then opens the desktop build finds it nineteenth, and the app looks like
 * it lost the change.
 *
 * So the stored value is **the full order of every tab**. The bar is that
 * order's first five; the rail is all of it. One drag reorders both.
 *
 * ## What the stored value is not
 *
 * It is not a membership list. A tab can be hidden from the bar but never
 * removed from the app — every tab stays reachable through the rail and the
 * more panel. Later, if hiding a tab entirely becomes a real request, that is a
 * second field rather than a reinterpretation of this one.
 *
 * ## Why it survives a version change
 *
 * Stored ids outlive the code that wrote them. A tab gets renamed, or a release
 * adds two more, and the stored order no longer names the same set. Dropping
 * unknown ids and appending the missing ones means an upgrade leaves the user's
 * arrangement intact and the new tabs findable at the end, rather than losing
 * the arrangement or dropping the new tab on the floor.
 */

export const NAV_STORAGE_KEY = 'lab-calc.nav.v1';

/**
 * How many tabs the phone bar holds, before the "more" item.
 *
 * The default, and the ceiling. Material 3 and the iOS Human Interface
 * Guidelines both specify 3–5 destinations; at 390px a six-item bar drops each
 * target under the 44px touch floor. The editor refuses to go outside that
 * range for the same reason — see `clampBar`.
 */
export const BAR_SIZE = 5;

export const MIN_BAR = 3;

/** A localStorage stand-in, used by tests and when storage is unavailable. */
export function memoryStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

/**
 * localStorage can throw — Safari private mode, a full quota, a browser policy.
 * The navigation must still work when it does, so fall back to memory.
 */
export function resolveStore(candidate) {
  try {
    const s = candidate ?? globalThis.localStorage;
    if (!s) return memoryStore();
    const probe = '__labcalc_nav_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return memoryStore();
  }
}

/**
 * Reconcile a stored order against the tabs that actually exist.
 *
 * `allIds` is authoritative — it is the live tab list. `saved` is whatever came
 * out of storage, which may name tabs that were renamed away and may be missing
 * tabs that a release added. The result is always a permutation of `allIds`:
 *
 *   - ids in `saved` that are not in `allIds` are dropped
 *   - ids in `allIds` that are not in `saved` are appended, in their own default
 *     order, so a newly shipped tab appears at the end rather than vanishing
 *   - duplicates in `saved` are ignored after the first
 *
 * Returning a permutation of the live list is what keeps this total: callers
 * never have to handle a tab that is missing from the order.
 */
export function reconcile(saved, allIds) {
  const known = new Set(allIds);
  const seen = new Set();
  const out = [];
  for (const id of Array.isArray(saved) ? saved : []) {
    // A string check as well as a set lookup: a corrupted store can hold
    // objects, and `known.has({})` would just be false — but keeping the guard
    // makes the string contract explicit at the boundary.
    if (typeof id !== 'string' || !known.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  for (const id of allIds) if (!seen.has(id)) out.push(id);
  return out;
}

/**
 * Read the stored preference: the order, and how many of it the bar shows.
 *
 * Both are reconciled rather than trusted. The order goes through
 * `reconcile`, and the size goes through `clampBar`, so a store written by an
 * older build — or edited by hand — still produces a bar the guidelines allow.
 */
export function loadNav(store, allIds) {
  let raw = null;
  try {
    raw = store.getItem(NAV_STORAGE_KEY);
  } catch {
    raw = null;
  }
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    // A corrupt value is indistinguishable from no value: both mean "use the
    // defaults". Throwing here would take down the first render.
    parsed = null;
  }
  return {
    order: reconcile(parsed?.order, allIds),
    size: clampBar(parsed?.size ?? BAR_SIZE),
  };
}

export function saveNav(store, { order, size }) {
  try {
    store.setItem(NAV_STORAGE_KEY, JSON.stringify({ order, size: clampBar(size) }));
  } catch {
    // Quota or a blocked store. The preference is cosmetic — losing it is not
    // worth failing the interaction that triggered the save.
  }
}

/** Drop the stored preference, so the next read falls back to the defaults. */
export function clearNav(store) {
  try {
    store.removeItem(NAV_STORAGE_KEY);
  } catch {
    /* see saveNav */
  }
}

/**
 * Move one item, returning a new array.
 *
 * A pure splice rather than a sort: the editor knows the source and target
 * indices, and every drag is expressible as one move. Indices are clamped
 * rather than validated, because a drag that ends past the last item means
 * "put it last", not "reject the drop".
 */
export function moveItem(order, from, to) {
  const n = order.length;
  if (n === 0) return [];
  const i = clamp(Math.trunc(from), 0, n - 1);
  const j = clamp(Math.trunc(to), 0, n - 1);
  if (i === j) return [...order];
  const out = [...order];
  const [item] = out.splice(i, 1);
  out.splice(j, 0, item);
  return out;
}

function clamp(n, lo, hi) {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}

/** How many tabs the bar may hold — the editor enforces the same bounds. */
export function clampBar(n) {
  return clamp(Math.trunc(n), MIN_BAR, BAR_SIZE);
}

/** The tabs the phone bar shows: the head of the order. */
export function barTabs(order, size = BAR_SIZE) {
  return order.slice(0, clampBar(size));
}

/** Everything else, in order — the "more" panel's contents. */
export function moreTabs(order, size = BAR_SIZE) {
  return order.slice(clampBar(size));
}

/** Whether the tab at `index` is one the bar shows. */
export function isInBar(index, size = BAR_SIZE) {
  return index < clampBar(size);
}