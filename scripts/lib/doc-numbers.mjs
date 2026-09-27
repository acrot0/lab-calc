/**
 * Find claims in the documentation that the build can check.
 *
 * Only one kind so far: the test count. It is the number that drifts, because
 * nothing depends on it — a wrong count does not break a build, so it survives
 * review, and it sits on the first screen of the repository where any reader can
 * disprove it in one command.
 *
 * ## Why the scan is narrow on purpose
 *
 * It matches `N 个测试` and `N tests` and nothing else. A general "numbers in
 * prose must be true" checker is not buildable, and one that guesses would fail
 * on `592 KB` and `v0.9.0` until someone turned it off. A guard that is wrong
 * gets deleted; a guard that is narrow gets kept.
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
    /(\d[\d,]*)\s*个测试/g,
    /(\d[\d,]*)\s*tests?\b/gi,
  ],
};

/** A count below this is prose, not a suite size. */
const MIN_PLAUSIBLE = 100;

/**
 * Every claim in `text` that disagrees with `actual`.
 *
 * @param {string} text the document
 * @param {{tests: number}} actual the real values
 * @returns {Array<{kind: string, found: number, line: number}>}
 */
export function staleNumbers(text, actual) {
  const out = [];
  for (const [kind, patterns] of Object.entries(PATTERNS)) {
    const want = actual[kind];
    if (typeof want !== 'number') continue;
    for (const re of patterns) {
      // A fresh regex per call: a `g` regex carries `lastIndex` between uses,
      // and sharing one across calls silently skips matches.
      const scan = new RegExp(re.source, re.flags);
      let m;
      while ((m = scan.exec(text)) !== null) {
        const found = Number(m[1].replace(/,/g, ''));
        if (!Number.isFinite(found) || found < MIN_PLAUSIBLE) continue;
        if (found === want) continue;
        out.push({ kind, found, line: text.slice(0, m.index).split('\n').length });
      }
    }
  }
  return out.sort((a, b) => a.line - b.line);
}
