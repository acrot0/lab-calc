import { useCallback, useSyncExternalStore } from 'react';

/**
 * Save the inventory and notify same-tab readers.
 * Kept beside the hook it serves: the dashboard follows the shelf live only
 * if writes go through here rather than the bare module saver.
 */
import { saveInventory } from './inventory.mjs';
import { saveTimers } from './timers.mjs';

export function saveInventoryLive(store, items) {
  const ok = saveInventory(store, items);
  if (ok) {
    try { window.dispatchEvent(new Event(NOTIFY)); } catch { /* no DOM */ }
  }
  return ok;
}

export function saveTimersLive(store, timers) {
  const ok = saveTimers(store, timers);
  if (ok) {
    try { window.dispatchEvent(new Event(NOTIFY)); } catch { /* no DOM */ }
  }
  return ok;
}

/*
 * One localStorage value, live across tabs.
 *
 * The dashboard reads what the shelf and timers tabs write, and those tabs
 * write through their own components — so the same key can change while this
 * component is mounted, in another tab. `useSyncExternalStore` is React's
 * escape hatch for exactly that: subscribe to the browser's `storage` event
 * (which fires in every *other* tab on a write) and re-read the key on each
 * notification, with no effect-driven mirror state to fall out of sync.
 *
 * Within one tab, writes go through the returned setter, which dispatches a
 * custom event after the store write — the browser's `storage` event does not
 * fire in the tab that made the change, so the custom event is what keeps the
 * current tab's readers live too.
 */

const NOTIFY = 'lab-calc:storage';

function subscribe(callback) {
  window.addEventListener('storage', callback);
  window.addEventListener(NOTIFY, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(NOTIFY, callback);
  };
}

/**
 * Read one key and re-read it whenever the store changes.
 *
 * Returns the raw string (or null), not a parsed value: parsing here would
 * need a memoised object per call, and every reader already owns its own
 * parse-and-validate loader.
 */
export function useStorageValue(key) {
  const read = useCallback(() => {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  }, [key]);
  return useSyncExternalStore(subscribe, read, () => null);
}

