import { describe, it, expect } from 'vitest';
import {
  requestPersistence, shouldRequest,
  PERSIST_GRANTED, PERSIST_DENIED, PERSIST_UNSUPPORTED, PERSIST_UNKNOWN,
} from '../src/ui/durability.mjs';

/*
 * Asking for persistent storage — and being honest about what it buys.
 *
 * The call exists because `localStorage` is "best effort" storage: under disk
 * pressure a browser evicts it silently, and the history goes with it. Asking
 * moves the origin into the "persistent" bucket, which is not evicted
 * automatically.
 *
 * What it does **not** do is protect against Safari's ITP, and a test here
 * holds that distinction in place: WebKit deletes all script-writable storage
 * after seven days without interaction, its own documentation says `persist()`
 * does not exempt an origin, and the PR proposing the exemption was rejected.
 * A version of this module that grew a comment claiming otherwise, or that
 * grew a settings row reading "protected", would be making a promise the
 * platform will break.
 */

describe('requestPersistence', () => {
  it('should report a grant', async () => {
    const storage = { persist: async () => true };
    expect(await requestPersistence(storage)).toBe(PERSIST_GRANTED);
  });

  it('should report a refusal as a refusal, not as a failure', async () => {
    const storage = { persist: async () => false };
    expect(await requestPersistence(storage)).toBe(PERSIST_DENIED);
  });

  it('should report a missing API as unsupported', async () => {
    // Distinct from a refusal: nothing was asked and nothing was answered.
    // Android WebView and older browsers land here.
    expect(await requestPersistence(undefined)).toBe(PERSIST_UNSUPPORTED);
    expect(await requestPersistence({})).toBe(PERSIST_UNSUPPORTED);
    expect(await requestPersistence({ persist: 'not a function' })).toBe(PERSIST_UNSUPPORTED);
  });

  it('should treat a thrown call as a refusal rather than as unsupported', async () => {
    // The API was present and the browser declined to answer. Saying
    // "unsupported" would misreport what happened.
    const storage = { persist: async () => { throw new Error('permission denied by policy'); } };
    expect(await requestPersistence(storage)).toBe(PERSIST_DENIED);
  });

  it('should never reject, whatever the storage does', async () => {
    // The app has to keep working in a private window, where the answer is
    // always a refusal and sometimes a throw.
    const hostile = { persist: () => { throw new Error('sync throw'); } };
    await expect(requestPersistence(hostile)).resolves.toBe(PERSIST_DENIED);
  });

  it('should default to the real navigator storage when called with nothing', async () => {
    // Called with no argument from `App`, so the global path has to work. In
    // jsdom `navigator.storage` is typically absent, which is a supported
    // outcome rather than a crash.
    const result = await requestPersistence();
    expect([PERSIST_UNSUPPORTED, PERSIST_DENIED, PERSIST_GRANTED]).toContain(result);
  });
});

describe('shouldRequest', () => {
  it('should ask when nothing is known yet', () => {
    expect(shouldRequest(PERSIST_UNKNOWN)).toBe(true);
    expect(shouldRequest(undefined)).toBe(true);
    expect(shouldRequest(null)).toBe(true);
  });

  it('should not ask again once the browser has answered', () => {
    /*
     * The grant is per-origin and outlives the session, and a refusal will not
     * change within one — Chromium's heuristics weigh engagement, which asking
     * does not change. Re-asking would spend a permission prompt for nothing.
     */
    expect(shouldRequest(PERSIST_GRANTED)).toBe(false);
    expect(shouldRequest(PERSIST_DENIED)).toBe(false);
    expect(shouldRequest(PERSIST_UNSUPPORTED)).toBe(false);
  });
});

describe('the module does not overstate what it provides', () => {
  it('should not claim the request exempts the origin from ITP', async () => {
    // Read as source text, because the claim in a comment is what a future
    // editor would trust. The check is crude and catches exactly the mistake
    // that matters: someone "fixing" the iOS data-loss report by pointing at
    // this function.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/ui/durability.mjs', 'utf8');
    expect(src).toMatch(/does not protect against Safari/i);
    expect(src).toMatch(/home screen/i);
    // The rejected-PR fact is the evidence; without it the caveat is just a
    // hedge and the next reader re-litigates it.
    expect(src).toMatch(/rejected|reject/i);
  });
});
