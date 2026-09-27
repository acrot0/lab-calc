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
 * `npm run verify` runs this, so the counts cannot drift again. The alternative
 * — a release checklist item — is the mechanism that already failed twice.
 *
 * The scanning is in `scripts/lib/doc-numbers.mjs` so the guard and this test
 * share one implementation rather than two that can disagree.
 */

const ACTUAL = { tests: 1730 };

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

describe('the repository documents', () => {
  const docs = ['README.md', 'docs/ROADMAP.md'].filter(existsSync);

  it('should have documents to check', () => {
    expect(docs.length).toBeGreaterThan(0);
  });

  it('should state the real test count everywhere it states one', () => {
    const problems = [];
    for (const file of docs) {
      for (const s of staleNumbers(readFileSync(file, 'utf8'), ACTUAL)) {
        problems.push(`${file}:${s.line} 写着 ${s.found}，实际 ${ACTUAL.tests}`);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
