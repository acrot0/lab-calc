/**
 * Cross-tab storage plumbing for the JSON backup.
 *
 * The inventory and timers modules each own their key; this module is the one
 * place that reads them together, so the backup stays a single derivation
 * rather than two imports leaking into the app component.
 */
export { loadInventory, saveInventory } from './inventory.mjs';
export { loadTimers, saveTimers } from './timers.mjs';

/** Merge two record lists by `id`, incoming winning, capped by the module's own loader. */
export function mergeById(existing, incoming) {
  const byId = new Map((existing ?? []).map((x) => [x.id, x]));
  for (const x of incoming ?? []) {
    if (x && typeof x.id === 'string') byId.set(x.id, x);
  }
  return [...byId.values()];
}
