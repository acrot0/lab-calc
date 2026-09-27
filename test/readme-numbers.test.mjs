import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { staleNumbers } from '../scripts/lib/doc-numbers.mjs';

/*
 * Numbers in the documentation that the build can check.
 *
 * The README said `1369 个测试` and the roadmap said `1,281 tests` while the
 * suite had grown past 1700. Neither number is load-bearing for the software —
 * which is exactly why nobody notices: a wrong count is not a crash, it is a
 * claim in the first screen of the repository that a reader can disprove in one
 * command. On a project whose pitch is "the numbers are checked", that is the
 * worst place to be wrong.
 *
 * The scanning is in `scripts/lib/doc-numbers.mjs` and runs from
 * `scripts/check-doc-numbers.mjs`, which `npm run verify` and CI both call. This
 * file tests the scanner's behaviour and the wiring, not the repository — see
 * the note above the wiring block for why.
 */

// A synthetic suite size. Deliberately not the real count: these cases test the
// scanner's arithmetic, and using the live number would make this file drift
// with the suite for no gain.
const ACTUAL = { tests: 1987 };

describe('staleNumbers', () => {
  it('should find a plain count', () => {
    expect(staleNumbers('npm test # 1369 个测试', ACTUAL)).toEqual([
      { kind: 'tests', found: 1369, line: 1 },
    ]);
  });

  it('should find a count written with a thousands separator', () => {
    expect(staleNumbers('1,281 tests.', ACTUAL)).toEqual([
      { kind: 'tests', found: 1281, line: 1 },
    ]);
  });

  it('should accept the real number in either form', () => {
    // Built from ACTUAL rather than written out, so this test does not become
    // the next thing to update by hand — which is the whole problem it exists
    // to catch.
    const n = ACTUAL.tests;
    expect(staleNumbers(`${n} 个测试`, ACTUAL)).toEqual([]);
    expect(staleNumbers(`${n.toLocaleString('en-US')} tests`, ACTUAL)).toEqual([]);
  });

  it('should report the line number, so the fix is one jump away', () => {
    const doc = ['# Title', '', 'A claim.', 'build. 1,281 tests. 592 KB of JS', ''].join('\n');
    expect(staleNumbers(doc, ACTUAL)[0].line).toBe(4);
  });

  it('should find every occurrence, not just the first', () => {
    const doc = '1369 个测试\n...\n1281 tests\n';
    expect(staleNumbers(doc, ACTUAL)).toHaveLength(2);
  });

  it('should ignore a number that is not a test count', () => {
    // A bundle size, a version, a year — the scan is deliberately narrow, so it
    // does not have to be right about everything to be trustworthy.
    expect(staleNumbers('592 KB of JS (185 KB gzipped)', ACTUAL)).toEqual([]);
    expect(staleNumbers('v0.9.0', ACTUAL)).toEqual([]);
    expect(staleNumbers('16 calculation tabs', ACTUAL)).toEqual([]);
  });

  it('should ignore a test count that is not about the suite', () => {
    // "3 tests" in a sentence about something else is not the suite size.
    expect(staleNumbers('the file has 3 tests', ACTUAL)).toEqual([]);
  });
});

/*
 * The scan over the real documents lives in `scripts/check-doc-numbers.mjs`,
 * not here. This file cannot count the suite it is running inside — spawning
 * `vitest --reporter=json` from a vitest worker is recursion, and hardcoding
 * the number is the very failure this guard exists to catch: it sat at 1987
 * while the suite passed 2024, and the two scanners then disagreed about which
 * number was stale. One source of truth, and it is the one that can measure.
 */
describe('the document scan is wired up', () => {
  it('should be part of the verify pipeline, so the counts cannot drift', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.scripts.verify).toContain('check-doc-numbers.mjs');
  });

  it('should scan every document that states a build number', () => {
    const src = readFileSync('scripts/check-doc-numbers.mjs', 'utf8');
    for (const doc of ['README.md', 'docs/ROADMAP.md', 'docs/research-value.zh.md']) {
      expect(src, `${doc} is not scanned`).toContain(doc);
    }
  });
});
