/**
 * Ask the browser to keep this origin's storage.
 *
 * ## What this does and does not buy
 *
 * Under storage pressure a browser evicts "best effort" data, and
 * `localStorage` is in that bucket. `navigator.storage.persist()` asks for the
 * origin to be moved to "persistent", which is not evicted automatically.
 *
 * **It does not protect against Safari's ITP.** WebKit deletes all
 * script-writable storage after seven days without user interaction, and its
 * own documentation states that `persist()` does not exempt an origin from
 * that; a PR proposing the exemption was rejected on the grounds that
 * `StorageManager.persist()` should not override ITP policy. The only exemption
 * on iOS is a web app added to the home screen.
 *
 * So this is a real but bounded improvement: it helps on Chromium where the
 * disk is tight, and it does nothing on iOS. The app's answer to the iOS case
 * is the disclosure in `disclaimer.mjs` and the install prompt's wording, not
 * this call.
 *
 * ## Why there is no interface for it
 *
 * The result is not actionable. A user told "storage not persistent" has no
 * button to press — the browser decides, and it decides by heuristics the page
 * cannot inspect. Its one use is as a second signal alongside a failed write,
 * which `App` reads to decide how firmly to word the banner. A settings row
 * reading "protected / not protected" would be a promise the app cannot keep.
 *
 * ## Why it is called once, after the first write
 *
 * Asking before any data exists is asking on behalf of nothing — Chromium's
 * heuristics weigh engagement and stored bytes, and a fresh origin has neither.
 * Once is enough: the grant is per-origin and persists across sessions, so
 * re-asking on every save would spend a permission prompt for no gain.
 */

/**
 * The value `App` keeps. `unsupported` and `denied` are different states and
 * are reported separately — the app cannot do anything about either, but a
 * reader of the banner's logic should not have to guess which happened.
 */
export const PERSIST_UNKNOWN = 'unknown';
export const PERSIST_GRANTED = 'granted';
export const PERSIST_DENIED = 'denied';
export const PERSIST_UNSUPPORTED = 'unsupported';

/**
 * Ask once. Never throws, never rejects.
 *
 * A storage API that is missing, blocked by policy, or that rejects the call
 * is a normal outcome rather than an error — this app must work in a private
 * window, where the answer is always a refusal.
 */
export async function requestPersistence(storage = globalThis.navigator?.storage) {
  if (!storage || typeof storage.persist !== 'function') return PERSIST_UNSUPPORTED;
  try {
    const granted = await storage.persist();
    return granted ? PERSIST_GRANTED : PERSIST_DENIED;
  } catch {
    // A throw here means the browser refused to answer, which is closer to a
    // refusal than to a grant. Reporting `unsupported` would be wrong: the API
    // was there.
    return PERSIST_DENIED;
  }
}

/**
 * Whether the answer is worth asking for at all.
 *
 * Called before the first request so a second mount does not re-prompt. The
 * caller stores the result; this module stays free of storage.
 */
export function shouldRequest(previous) {
  return !previous || previous === PERSIST_UNKNOWN;
}
