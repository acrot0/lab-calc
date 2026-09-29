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
 *
 * The set of metadata fields a record may carry is not compiled in here any
 * more — see `field-template.mjs`. It is installed through `setTemplate()`,
 * which `App` does once on mount, before the first history read.
 */

import {
  BUILTIN_FIELDS, resolveTemplate, retainedKeys, fieldOf, currentKeys, currentMaxLength,
} from './field-template.mjs';

export const STORAGE_KEY = 'lab-calc.history.v1';
export const MAX_ENTRIES = 500;

/**
 * How many deleted records are kept.
 *
 * Smaller than `MAX_ENTRIES`, because a tombstone answers a narrower question:
 * "can I get back the thing I just deleted". 300 × 381 B ≈ 114 KB, which
 * together with a full 500 live records comes to roughly 280 KB — eighteen
 * times under a ~5 MB localStorage quota.
 *
 * The number that made this necessary: without a cap, ten "clear all" actions
 * reached 2 MB. See the note on `saveHistory`.
 */
export const MAX_TOMBSTONES = 300;

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

export function loadHistory(store, template = null) {
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // A malformed row must not take the whole list with it.
    return migrateHistory(
      parsed.filter((e) => e && typeof e === 'object' && typeof e.kind === 'string'),
      template,
    );
  } catch {
    return [];
  }
}

/**
 * Persist the history.
 *
 * The cap counts **visible** records, not total rows. Counting tombstones
 * would mean a user who deleted a hundred records silently started losing live
 * ones — the cap exists to bound what the list shows, and a deleted record
 * shows nothing. The tombstones are bounded separately, by `MAX_TOMBSTONES`.
 *
 * Returns `false` when the write fails — a full quota, Safari private mode, a
 * browser policy. **The caller must check it.** The whole feature is "every
 * calculation is kept", and a rejected write is the one way that promise
 * breaks without anything on screen changing: React state still holds the new
 * record, so the list looks right until the next load.
 */
export function saveHistory(store, entries, max = MAX_ENTRIES) {
  try {
    const all = entries ?? [];
    /*
     * Counted by position, not by id.
     *
     * The first version collected the surviving ids into a Set and filtered on
     * membership — which silently kept everything when a record had no id,
     * because `undefined` is not in the set and the filter's `e.deletedAt ||`
     * arm did not save it either. Records without ids do occur: they are what
     * the fixtures build, and an older hand-written bundle can produce them.
     *
     * Walking once and counting is both correct and simpler: keep tombstones
     * until their own cap is reached, keep live records until theirs is, drop
     * the rest.
     *
     * ## Why tombstones need a cap at all
     *
     * They used to be kept without limit, on the argument that they are small.
     * Measured: 381 bytes each, and one "clear all" mints one per visible
     * record. Ten clears reached 2 MB against a ~5 MB quota — the deleted
     * records, which the user believes are gone, were on track to become the
     * thing that stops new ones being saved. The cap keeps the audit trail's
     * purpose (a deletion is recoverable) without letting it evict the present.
     *
     * **Most recently deleted first.** The tombstone a user is about to want
     * back is the one they deleted a moment ago, not one from months ago.
     */
    const live = [];
    const dead = [];
    for (const e of all) {
      if (!e) continue;
      if (e.deletedAt) dead.push(e);
      else if (live.length < max) live.push(e);
    }
    const deadKept = dead.length <= MAX_TOMBSTONES
      ? dead
      : dead
        .map((e, i) => ({ e, i }))
        .sort((a, b) => {
          const byStamp = String(b.e.deletedAt).localeCompare(String(a.e.deletedAt));
          // Ties keep the original order, so the result is deterministic.
          return byStamp !== 0 ? byStamp : a.i - b.i;
        })
        .slice(0, MAX_TOMBSTONES)
        .map((x) => x.e);
    /*
     * Live records first, then tombstones.
     *
     * Order inside the file is not what any reader uses — the list sorts by
     * `at` and the trash sorts by `deletedAt` — but keeping the two groups
     * contiguous makes the stored file readable when someone opens it, which
     * is the file the user is told to keep as a backup.
     */
    store.setItem(STORAGE_KEY, JSON.stringify([...live, ...deadKept]));
    return true;
  } catch {
    return false;
  }
}

/**
 * Prepend an entry, newest first.
 *
 * ## What the slice actually counted
 *
 * `MAX_ENTRIES` is documented as bounding the **visible** list, and
 * `saveHistory` honours that — it counts live records and keeps tombstones
 * separately. This function did not: it sliced the whole array, tombstones
 * included, so a user with 500 visible records and any deletion history lost
 * every tombstone the moment they recorded the next calculation.
 *
 * That is the audit trail silently failing at exactly the size where it
 * matters. The trash list went empty, "restore" had nothing to restore, and
 * the backup export — which exists to carry what was deleted — carried
 * nothing. Nothing errored; the records were simply gone.
 *
 * So the trim now counts the way the cap is documented: visible records
 * against `MAX_ENTRIES`. Tombstones are **not** trimmed here at all —
 * `saveHistory` owns that bound (`MAX_TOMBSTONES`), and having two places
 * trim the same list is how the two counts drift apart. One bounder, against
 * the records that survive, is the whole rule.
 */
export function addEntry(entries, entry, now = new Date()) {
  const withMeta = {
    ...entry,
    at: now.toISOString(),
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  const live = [];
  const dead = [];
  for (const e of [withMeta, ...(entries ?? [])]) {
    if (!e) continue;
    if (e.deletedAt) dead.push(e);
    else if (live.length < MAX_ENTRIES) live.push(e);
  }
  return [...live, ...dead];
}

/**
 * Delete a record — by marking it, not by removing it.
 *
 * The largest gap against ALCOA, the standard an electronic lab notebook is
 * held to. Its **Original** principle protects the ability to answer "what did
 * I actually write down" after the fact, and a filter destroys exactly that.
 *
 * This is not a theoretical concern for this app. The history holds real
 * thesis data, and "clear all" was one click with nothing to undo — a mis-click
 * destroyed the only copy, and the summary that would have identified it went
 * with it.
 *
 * So the body stays and the record gains a `deletedAt`. It leaves the list the
 * user sees and stays in the file. The cost is bytes in localStorage; the
 * alternative costs data that cannot be recovered.
 *
 * Not re-stamped on a second delete: the timestamp records when the user
 * deleted the record, not when they last clicked the icon.
 */
export function removeEntry(entries, id, now = new Date()) {
  return (entries ?? []).map((e) => {
    if (!e || e.id !== id || e.deletedAt) return e;
    return { ...e, deletedAt: now.toISOString() };
  });
}

/** Undo a deletion, body and all. */
export function restoreEntry(entries, id) {
  return (entries ?? []).map((e) => {
    if (!e || e.id !== id || !e.deletedAt) return e;
    const { deletedAt: _drop, ...rest } = e;
    return rest;
  });
}

/**
 * The records the user should see.
 *
 * The whole rest of the app reads this rather than the raw list, so a deleted
 * record cannot leak back into a count, a search result, or an export by one
 * caller forgetting to filter.
 */
export function visibleEntries(entries) {
  return (entries ?? []).filter((e) => e && !e.deletedAt);
}

/** The deleted records, most recently deleted first. */
export function deletedEntries(entries) {
  return (entries ?? [])
    .filter((e) => e && e.deletedAt)
    .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
}

/**
 * Clear the history — which, like a single delete, marks rather than erases.
 *
 * This was the most destructive control in the app: one click, no confirmation,
 * no undo, and the records were gone before the user could see how many there
 * had been. Marking makes the button reversible, which is what makes it safe
 * to have on screen at all.
 */
export function clearHistory(entries = [], now = new Date()) {
  const stamp = now.toISOString();
  return (entries ?? []).map((e) => (e && !e.deletedAt ? { ...e, deletedAt: stamp } : e));
}

/** Case-insensitive search across the summary line and the raw inputs. */
export function filterHistory(entries, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (q.length === 0) return entries;
  return visibleEntries(entries).filter((e) => {
    // The metadata is searched alongside the summary and inputs: an experiment
    // number is exactly the thing a user types into this box. It is joined as
    // its values rather than as JSON so a search for `EXP-1` does not have to
    // match the quotes and braces around it.
    const meta = Object.values(e.meta ?? {}).join(' ');
    const hay = `${e.summary ?? ''} ${meta} ${JSON.stringify(e.inputs ?? {})}`.toLowerCase();
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
 *
 * ## Why the five analysis tabs are in here
 *
 * They were not, and the failure was worse than a wrong tab: `planReplay`
 * returns null for a kind it does not know, and `App.replay` ignores a null
 * plan. So the replay button was rendered, enabled, and did nothing at all —
 * for every record from the biology, uncertainty, data, analytical and
 * physical tabs. Nothing about the button looked broken, which is why it went
 * unnoticed through five releases.
 *
 * All five tabs take `restored` and seed their state from it, so the route was
 * the only thing missing.
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
  bio: 'bio',
  uncertainty: 'uncertainty',
  stats: 'stats',
  analytical: 'analytical',
  physical: 'physical',
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

/* ==========================================================================
   Record metadata — "which experiment is this, and what is it for"
   --------------------------------------------------------------------------
   Every record the app writes is anonymous: a timestamp, a kind, a summary.
   That is enough to find a calculation again, and not enough to answer the
   question a lab notebook exists to answer.

   Three fields, fixed rather than free-form. The value of a field is that it
   can be filtered and exported as a column; a free-text blob can be neither,
   and the summary line already is one. A user who needs prose has the summary
   and the export notes.

   The fields live in `entry.meta`, beside the record rather than inside
   `inputs`. `inputs` is what gets replayed into a tab — a field that is not
   an input to the calculation must not be fed back as one, and an experiment
   number is not a concentration.
   ========================================================================== */

/**
 * The fields a record can carry.
 *
 * `key` is the storage key and must not change when a label is reworded — the
 * same rule as `field-labels.mjs`. `maxLength` bounds the storage a single
 * record can add: 500 records × 3 fields × 200 chars is 300 KB at the very
 * worst, well inside a localStorage quota.
 */
export const META_FIELDS = BUILTIN_FIELDS;

/**
 * Set metadata on one record, merging with whatever is already there.
 *
 * Returns a new list; the input is not mutated. A field set to whitespace is
 * **removed** rather than stored empty — a blank-but-present key exports as a
 * column that reads "measured and empty" instead of "never filled in", which
 * is a different claim.
 *
 * Unknown keys are dropped rather than stored: an undeclared key would export
 * as a column nothing can label. "Declared" now means anything the template in
 * force retains, which includes a retired field — its values are still on
 * existing records and still need a heading.
 */
export function setEntryMeta(entries, id, patch) {
  if (!id || !patch || typeof patch !== 'object') return entries;
  const allowed = currentKeys();
  return (entries ?? []).map((e) => {
    if (!e || e.id !== id) return e;
    const meta = { ...(e.meta ?? {}) };
    for (const key of allowed) {
      if (!(key in patch)) continue;
      const raw = patch[key];
      if (raw === null || raw === undefined) {
        delete meta[key];
        continue;
      }
      const value = String(raw).trim().slice(0, currentMaxLength(key));
      if (value === '') delete meta[key];
      else meta[key] = value;
    }
    if (Object.keys(meta).length === 0) {
      const { meta: _drop, ...rest } = e;
      return rest;
    }
    return { ...e, meta };
  });
}

/**
 * Normalise records read from storage.
 *
 * v1 records have no `meta` and must keep working — they are the entire
 * history of every existing user, so the migration adds nothing and removes
 * nothing. What it does do is drop a `meta` that is not a plain object, which
 * a hand-edited or corrupted file can produce; the UI reads `.experiment` off
 * it, and a string there would render as undefined rather than failing loudly.
 *
 * Deliberately not a version bump. The storage key stays `v1` because the
 * format is unchanged in the direction that matters: every v1 record is still
 * valid, and a v1 reader given a record with extra keys ignores them. Bumping
 * would force a migration path for a change that needs none, and would make
 * older builds refuse a file they can read perfectly well.
 *
 * The `template` argument defaults to whatever is installed. It is only ever
 * passed by a caller that has just loaded a template and wants the records
 * normalised against it in the same breath — the two reads happen together on
 * mount, and normalising against a different template than the one installed
 * would drop exactly the values the template was loaded to preserve.
 */
export function migrateHistory(entries, tpl = null) {
  const resolved = tpl ? resolveTemplate(tpl) : null;
  const allowed = resolved ? retainedKeys(resolved) : currentKeys();
  const cap = (key) => (resolved
    ? (fieldOf(resolved, key)?.maxLength ?? 60)
    : currentMaxLength(key));
  if (!Array.isArray(entries)) return [];
  return entries.map((e) => {
    if (!e || typeof e !== 'object') return e;
    const cleanDeleted = typeof e.deletedAt === 'string' && e.deletedAt !== ''
      ? e.deletedAt
      : undefined;
    if (cleanDeleted === undefined && e.deletedAt !== undefined) {
      const { deletedAt: _drop, ...rest } = e;
      return rest;
    }
    if (e.meta === undefined) return e;
    if (e.meta === null || typeof e.meta !== 'object' || Array.isArray(e.meta)) {
      const { meta: _drop, ...rest } = e;
      return rest;
    }
    // Keep only declared keys, each a non-empty string.
    const meta = {};
    for (const key of allowed) {
      const v = e.meta[key];
      if (typeof v === 'string' && v.trim() !== '') {
        meta[key] = v.trim().slice(0, cap(key));
      }
    }
    if (Object.keys(meta).length === 0) {
      const { meta: _drop, ...rest } = e;
      return rest;
    }
    return { ...e, meta };
  });
}
