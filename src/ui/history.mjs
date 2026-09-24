/**
 * Calculation history — the reason this tool exists.
 *
 * Every lab calculator on the market does the arithmetic and forgets it. The
 * question a chemist actually asks a week later is "how did I make that
 * buffer?", and no calculator answers it. An ELN does, but an ELN demands you
 * set up a project and fill in a template first — far too heavy for a two-line
 * calculation.
 *
 * This is the middle layer: every calculation is kept, automatically, with no
 * ceremony.
 *
 * Storage is an injected interface (`getItem`/`setItem`) rather than direct
 * localStorage access, so the logic is testable without a browser.
 */

export const STORAGE_KEY = 'lab-calc.history.v1';
export const MAX_ENTRIES = 500;

/** A minimal in-memory store, used by tests and as a fallback when storage is unavailable. */
export function memoryStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

/**
 * localStorage can throw: Safari private mode, a full quota, or a browser
 * policy. A calculator must still work when it does, so fall back silently
 * rather than taking the whole app down over a history list.
 */
export function resolveStore(candidate) {
  try {
    const s = candidate ?? globalThis.localStorage;
    if (!s) return memoryStore();
    const probe = '__labcalc_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return memoryStore();
  }
}

export function loadHistory(store) {
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // A malformed row must not take the whole list with it.
    return parsed.filter((e) => e && typeof e === 'object' && typeof e.kind === 'string');
  } catch {
    return [];
  }
}

export function saveHistory(store, entries) {
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Prepend an entry, newest first.
 *
 * The cap is enforced on write so the list cannot grow without bound — an
 * unbounded history eventually exceeds the storage quota and then fails on
 * every subsequent save.
 */
export function addEntry(entries, entry, now = new Date()) {
  const withMeta = {
    ...entry,
    at: now.toISOString(),
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  return [withMeta, ...entries].slice(0, MAX_ENTRIES);
}

export function removeEntry(entries, id) {
  return entries.filter((e) => e.id !== id);
}

export function clearHistory() {
  return [];
}

/** Case-insensitive search across the summary line and the raw inputs. */
export function filterHistory(entries, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (q.length === 0) return entries;
  return entries.filter((e) => {
    const hay = `${e.summary ?? ''} ${JSON.stringify(e.inputs ?? {})}`.toLowerCase();
    return hay.includes(q);
  });
}

/** Re-run a stored calculation by feeding its inputs back to the same function. */
export function replayInputs(entry) {
  return entry?.inputs ?? null;
}

/**
 * Which tab owns each calculation kind.
 *
 * Kept here rather than in the component so the mapping can be tested — a
 * replay button that opens the wrong tab is a silent, easy-to-ship bug.
 */
export const KIND_TO_TAB = {
  massForMolarity: 'weigh',
  stockFromSolid: 'weigh',
  dilution: 'dilute',
  bufferRecipe: 'buffer',
  dilutionSeries: 'series',
  phCalc: 'ph',
  percentSolution: 'percent',
  titrationCurve: 'curve',
  reagent: 'reagent',
  spectro: 'spectro',
  lab: 'lab',
  colligative: 'colligative',
  reaction: 'reaction',
  electro: 'electro',
};

/**
 * Resolve a history entry into what the UI needs to restore it: which tab, and
 * what to prefill. Returns null for an unknown kind so the caller can leave the
 * view alone rather than navigating somewhere arbitrary.
 */
export function planReplay(entry) {
  const tab = KIND_TO_TAB[entry?.kind];
  const inputs = replayInputs(entry);
  if (!tab || !inputs) return null;
  return { tab, inputs };
}
