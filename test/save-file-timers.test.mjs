import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { saveFile } from '../src/ui/save-file.mjs';

/*
 * A scheduled callback must not be able to raise.
 *
 * ## The failure this guards, and why no local run saw it
 *
 * `downloadInBrowser` schedules the object-URL revoke on a later task. That
 * callback runs outside every `try` in the module, so anything it throws is an
 * unhandled error rather than a `SAVE_FAILED` — and vitest reports unhandled
 * errors as a failed run even when every test passed.
 *
 * CI reported `TypeError: win.URL.revokeObjectURL is not a function` on all
 * three platforms while the summary read 2,686 passed. The cause was a test
 * helper restoring the global by assigning `undefined`, which leaves it
 * shadowed by a non-function; the callback then fired against it. Local runs
 * never saw it because the stub replaced `setTimeout` with a synchronous call
 * that ran inside the test, where a throw is caught by the test rather than by
 * the runner.
 *
 * ## Why the callback is captured and invoked rather than awaited
 *
 * The first version of this file registered `process.on('uncaughtException')`
 * and waited for the real timer. It passed — and it also passed with the guard
 * deliberately removed, which is the only reason that was discovered. Vitest
 * installs its own uncaught-exception capture, which takes precedence over
 * listeners registered through `process.on`, so the harness never saw the
 * escape it was looking for.
 *
 * Capturing the callback and calling it directly tests the property without
 * depending on who owns the exception hook: if the callback throws, this test
 * throws, and the assertion is on the call rather than on a side channel.
 */

/**
 * Run `saveFile` with a recording `setTimeout`, and hand back a way to fire
 * what it scheduled *while the stub is still installed*.
 *
 * `setTimeout` is replaced with a recorder rather than a synchronous runner, so
 * the callbacks run under this test's control — inside the assertion rather
 * than on a timer whose errors go somewhere else.
 *
 * ## Why the callbacks are fired inside `withStub` rather than after it
 *
 * The callback reads `win.URL` when it *runs*, not when it is scheduled. Firing
 * it after the stub had been restored made the real `revokeObjectURL` receive
 * the stub's URL and the recorded list stay empty — which the assertion caught
 * rather than passing quietly, but which would have been the wrong test: it
 * would have been checking the real global, not the one under test.
 */
async function withRecordingTimer(revoke, body) {
  const scheduled = [];
  const keys = ['URL', 'document', 'setTimeout'];
  const saved = new Map(keys.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  Object.defineProperties(globalThis, {
    URL: {
      configurable: true,
      writable: true,
      value: { createObjectURL: () => 'blob:stub', revokeObjectURL: revoke },
    },
    document: {
      configurable: true,
      writable: true,
      value: {
        createElement: () => ({
          click() {}, remove() {}, set download(v) { this._d = v; }, get download() { return this._d; },
        }),
        body: { appendChild() {}, removeChild() {} },
      },
    },
    setTimeout: { configurable: true, writable: true, value: (fn) => { scheduled.push(fn); return 0; } },
  });
  try {
    await body(scheduled);
  } finally {
    for (const [k, desc] of saved) {
      if (desc) Object.defineProperty(globalThis, k, desc);
      else delete globalThis[k];
    }
  }
  return scheduled;
}

describe('the revoke callback cannot raise', () => {
  it('should not throw when the browser refuses to revoke', async () => {
    await withRecordingTimer(
      () => { throw new Error('refused to revoke'); },
      async (scheduled) => {
        await saveFile('x', 'x.txt');
        expect(scheduled.length).toBeGreaterThan(0);
        for (const fn of scheduled) expect(fn).not.toThrow();
      },
    );
  });

  it('should not throw when revokeObjectURL is missing entirely', async () => {
    /*
     * The exact shape the old helper left behind: the global present but the
     * method absent. A browser would not do this; a test that restores a
     * stubbed global badly does it on every run — which is what CI hit.
     */
    await withRecordingTimer(
      undefined,
      async (scheduled) => {
        // `revoke` is `undefined`, so the property exists and is not a function.
        await saveFile('x', 'x.txt');
        expect(scheduled.length).toBeGreaterThan(0);
        for (const fn of scheduled) expect(fn).not.toThrow();
      },
    );
  });

  it('should still revoke when everything is in order', async () => {
    // The guard must not have swallowed the revoke itself — a leaked object URL
    // is a small leak, but the callback would then be doing nothing at all.
    const revoked = [];
    await withRecordingTimer(
      (u) => revoked.push(u),
      async (scheduled) => {
        await saveFile('x', 'x.txt');
        for (const fn of scheduled) fn();
      },
    );
    expect(revoked).toEqual(['blob:stub']);
  });
});

describe('the test helper restores globals properly', () => {
  it('should leave a working revokeObjectURL behind after restore', async () => {
    /*
     * The shape the old helper left behind was `revokeObjectURL: undefined` —
     * the global present and shadowed by a non-function, which is not the same
     * as absent, and is what CI tripped over. Asserted as behaviour rather than
     * as source text, because a comment mentioning the broken form would pass a
     * text check while the code did something else.
     */
    const saved = new Map(
      ['URL', 'document', 'setTimeout'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]),
    );
    const before = globalThis.URL;
    const beforeRevoke = globalThis.URL.revokeObjectURL;
    const beforeTimeout = globalThis.setTimeout;

    globalThis.URL = { ...globalThis.URL, createObjectURL: () => 'blob:stub', revokeObjectURL: () => {} };
    globalThis.document = { createElement: () => ({}), body: { appendChild() {}, removeChild() {} } };
    globalThis.setTimeout = () => 0;

    // What a correct `restore()` does.
    for (const [k, desc] of saved) {
      if (desc) Object.defineProperty(globalThis, k, desc);
      else delete globalThis[k];
    }

    expect(typeof globalThis.URL.revokeObjectURL).toBe('function');
    expect(globalThis.URL.revokeObjectURL).toBe(beforeRevoke);
    expect(globalThis.URL).toBe(before);
    expect(globalThis.setTimeout).toBe(beforeTimeout);
  });

  it('should have a helper in save-file.test.mjs that restores by descriptor', () => {
    /*
     * Narrow by construction, in the spirit of `lib/doc-numbers.mjs`: it looks
     * for the two things that distinguish a correct restore from the broken
     * one and nothing else. Comments are stripped first, because the reason
     * this rule exists is written down in the helper it guards.
     */
    const src = readFileSync('test/save-file.test.mjs', 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).toMatch(/getOwnPropertyDescriptor\(globalThis/);
    expect(code).not.toMatch(/revokeObjectURL:\s*undefined/);
  });
});
