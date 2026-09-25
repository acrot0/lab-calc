import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * No file may reference a module-level name it never defines or imports.
 *
 * This exists because one shipped: `CHART_COLORS` was used in SpectroTab.jsx
 * but defined in CurveTab.jsx, so the tab threw `CHART_COLORS is not defined`
 * inside a `useMemo` and React unmounted the whole app — a blank page.
 *
 * The server-side render test did not catch it because the reference was
 * inside a `useMemo` that only runs on the client... except that it was not,
 * which is the point: a name that does not exist is a name that does not
 * exist, and neither test was looking for it. The render test catches missing
 * React imports; this catches everything else.
 *
 * Implemented by asking the language server rather than by writing a parser.
 * `tsc --noEmit` on the JSX files reports exactly this class of error and
 * already understands imports, scopes and shadowing. A regex approximation
 * would produce false positives on every property name in the codebase.
 */

/** The source files worth checking: the app, not the tests or the scripts. */
function sourceFiles(dir = 'src') {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry).replaceAll('\\', '/');
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(jsx|mjs|js)$/.test(entry)) out.push(p);
  }
  return out;
}

describe('undefined references', () => {
  it('should find the source files to check', () => {
    // A glob that matched nothing would make the check below vacuous.
    expect(sourceFiles().length).toBeGreaterThan(20);
  });

  it('should type-check the source without unresolved names', () => {
    /*
     * `--noEmit` only: this checks names, it does not emit anything.
     *
     * `--checkJs` is required, and getting it wrong is how this test was
     * silently useless at first: with `--checkJs false`, tsc skips JavaScript
     * files entirely and reports nothing, so the test passed with the bug it
     * was written for still in the tree. It was only trusted after the bug was
     * reintroduced on purpose and the test failed.
     *
     * Checking JavaScript does produce complaints about untyped parameters, so
     * only the codes that mean "this name does not exist" are treated as
     * failures. The rest are the cost of type-checking a project that does not
     * annotate, and are ignored.
     */
    let output = '';
    try {
      output = execFileSync('npx', [
        'tsc', '--noEmit', '--allowJs', '--checkJs',
        '--jsx', 'react-jsx', '--target', 'es2022', '--module', 'esnext',
        '--moduleResolution', 'bundler', '--skipLibCheck', '--noResolve',
        ...sourceFiles(),
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      output = `${e.stdout ?? ''}${e.stderr ?? ''}`;
    }

    // TS2304: Cannot find name 'X'. TS2552: Cannot find name 'X'. Did you mean 'Y'?
    // TS2305: Module has no exported member. TS2614: no default export.
    const UNDEFINED = /error TS(2304|2552|2305|2614):/;
    const problems = output
      .split('\n')
      .filter((line) => UNDEFINED.test(line))
      // tsc echoes the flags back on some versions; keep only diagnostics.
      .filter((line) => /\.(jsx|mjs|js)\b/.test(line))
      .map((line) => line.trim());

    expect(problems, problems.join('\n')).toEqual([]);
  }, 120000);
});
