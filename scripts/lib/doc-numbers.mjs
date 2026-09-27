/**
 * Find claims in the documentation that the build can check.
 *
 * Two kinds so far: the test count and the test-file count. They drift because
 * nothing depends on them — a wrong count does not break a build, so it survives
 * review, and it sits on the first screen of the repository where any reader can
 * disprove it in one command.
 *
 * ## Why the scan is narrow on purpose
 *
 * It matches the ways a test count is actually written in these documents —
 * `N 个测试`, `N tests`, `测试 N 通过` — and nothing else. A general "numbers in
 * prose must be true" checker is not buildable, and one that guesses would fail
 * on `592 KB` and `v0.9.0` until someone turned it off. A guard that is wrong
 * gets deleted; a guard that is narrow gets kept.
 *
 * The third form was added after the first two passed while the README's status
 * table said `测试 2055 通过 / 100 文件` against a suite of 2069. The number sat
 * in the first screen of the repository, in a table, next to a file count that
 * was also wrong — and the scan walked past it because the count came first and
 * the word came second. A pattern list that knows one word order only guards
 * documents written in that word order.
 *
 * The count must also look like a suite size — at least three digits — so the
 * sentence "the file has 3 tests" is not reported as a stale suite count.
 *
 * Lives here rather than in the check script so the script and its test read
 * one implementation. Two copies of a rule is how the rule becomes two rules.
 */

/** How each kind of claim is written, in either language. */
const PATTERNS = {
  tests: [
    // The lookaheads keep `36 个测试文件` / `101 test files` out of this kind.
    // They belong to the file count, and reporting them here as well would turn
    // one stale file count into two findings with two different suggested fixes.
    /(\d[\d,]*)\s*个测试(?!文件)/g,
    /(\d[\d,]*)\s*tests?\b(?!\s*files?\b)/gi,
    // `750 个自动化测试` — a qualifier between the count and the noun. The `+`
    // plus the exclusion of 测 is what keeps this off the plain `1369 个测试`
    // above: a pattern that can match zero qualifier characters reports every
    // plain count twice.
    /(\d[\d,]*)\s*个[^\s，。；、)）测]+测试(?!文件)/g,
    // `测试 2069 通过 / 101 文件` — the order the README's status table uses.
    /测试\s*(\d[\d,]*)\s*(?:通过|passing)/g,
  ],
  files: [
    /(\d[\d,]*)\s*个测试文件/g,
    /(\d[\d,]*)\s*test files?\b/gi,
    // `测试 2069 通过 / 101 文件` — the count after the slash.
    /\d[\d,]*\s*通过\s*\/\s*(\d[\d,]*)\s*文件/g,
  ],
};

/**
 * A count below this is prose, not a measurement of the suite.
 *
 * Per kind, because the two live on different scales: no document describes a
 * suite of three tests, and none describes one of two files — but a real suite
 * has tens of files and thousands of tests, so a single threshold would either
 * let a stray "3 tests" through or report every honest file count.
 */
const MIN_PLAUSIBLE = { tests: 100, files: 5 };

/**
 * Every claim in `text` that disagrees with `actual`.
 *
 * @param {string} text the document
 * @param {{tests?: number, files?: number}} actual the real values
 * @returns {Array<{kind: string, found: number, line: number}>}
 */
export function staleNumbers(text, actual) {
  const out = [];
  for (const [kind, patterns] of Object.entries(PATTERNS)) {
    const want = actual[kind];
    if (typeof want !== 'number') continue;
    const floor = MIN_PLAUSIBLE[kind];
    for (const re of patterns) {
      // A fresh regex per call: a `g` regex carries `lastIndex` between uses,
      // and sharing one across calls silently skips matches.
      const scan = new RegExp(re.source, re.flags);
      let m;
      while ((m = scan.exec(text)) !== null) {
        const found = Number(m[1].replace(/,/g, ''));
        if (!Number.isFinite(found) || found < floor) continue;
        if (found === want) continue;
        out.push({ kind, found, line: text.slice(0, m.index).split('\n').length });
      }
    }
  }
  return out.sort((a, b) => a.line - b.line);
}
