import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/*
 * Rules the test suite has to follow about itself.
 *
 * ## Why this exists
 *
 * CI failed on macOS and Linux with all 1931 tests passing. The failure was an
 * unhandled `ReferenceError: window is not defined` raised after teardown, from
 * a test file that mounted a React tree and never unmounted it: React keeps
 * scheduler work queued for a root that is still mounted, and when a lazy child
 * resolved it committed into an environment that no longer existed.
 *
 * It never failed on Windows because the chunk arrived before teardown. A
 * platform-dependent failure that reports every test green is the worst kind to
 * debug, and the fix — unmount what you mount — is easy to forget in the next
 * file. So it is checked here rather than remembered.
 *
 * ## Why source text and not behaviour
 *
 * The alternative is running the suite on three platforms per commit, which is
 * what CI already does and what let this through. A source check is crude and
 * catches the mistake at the point it is made, in the file that made it, with
 * the offending filename in the message.
 */

const TESTS = readdirSync('test').filter((f) => f.endsWith('.test.mjs'));

describe('test files that mount React trees', () => {
  const mounting = TESTS.filter((f) => /createRoot\(/.test(readFileSync(`test/${f}`, 'utf8')));

  it('should find the files that mount, so this check is not vacuous', () => {
    // A refactor that moved every mount behind a shared helper would leave this
    // scanning nothing and passing forever.
    expect(mounting.length).toBeGreaterThan(3);
  });

  it('should unmount every root they create', () => {
    /*
     * The check is for an `unmount()` call in the file, not for a particular
     * shape of tracker: a file that unmounts inline is fine, and one that
     * clears the DOM and calls it done is not. The distinction is what the
     * failing file got wrong.
     */
    const offenders = [];
    for (const f of mounting) {
      const src = readFileSync(`test/${f}`, 'utf8');
      if (!/\.unmount\(\)/.test(src)) offenders.push(f);
    }
    expect(offenders, `these mount React roots and never unmount them: ${offenders.join(', ')}`)
      .toEqual([]);
  });

  it('should not rely on clearing document.body to stop React', () => {
    /*
     * `document.body.innerHTML = ''` removes the nodes and leaves the root
     * object and its scheduler alive. It reads like cleanup and is not.
     */
    const offenders = [];
    for (const f of mounting) {
      const src = readFileSync(`test/${f}`, 'utf8');
      const clearsBody = /document\.body\.innerHTML\s*=\s*''/.test(src);
      if (clearsBody && !/\.unmount\(\)/.test(src)) offenders.push(f);
    }
    expect(offenders, `these clear the DOM and call it cleanup: ${offenders.join(', ')}`)
      .toEqual([]);
  });
});

describe('the suite does not leave timers running', () => {
  it('should not use a bare setTimeout in a test body without clearing it', () => {
    /*
     * A pending timer keeps the worker alive past teardown and surfaces as an
     * unhandled error against whichever file happened to be running. `await
     * sleep(ms)` inside an async test is fine — it resolves and the test does
     * not finish until it has — so only a fire-and-forget call is flagged.
     */
    const offenders = [];
    for (const f of TESTS) {
      const src = readFileSync(`test/${f}`, 'utf8');
      // `setTimeout(...)` not preceded by `await`, `return`, or an assignment.
      for (const m of src.matchAll(/(?<!await\s)(?<!return\s)\bsetTimeout\(/g)) {
        const line = src.slice(0, m.index).split('\n').length;
        const before = src.slice(Math.max(0, m.index - 40), m.index);
        if (/\b(const|let|var)\s+\w+\s*=\s*$/.test(before)) continue; // stored, presumably cleared
        if (/^\s*\/\//.test(src.split('\n')[line - 1])) continue; // in a comment
        offenders.push(`${f}:${line}`);
      }
    }
    expect(offenders, `fire-and-forget timers: ${offenders.join(', ')}`).toEqual([]);
  });
});
