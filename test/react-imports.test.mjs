import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every React hook a component uses must be imported.
 *
 * This exists because of a real bug: a hook was added to a component whose
 * React import listed only `useState, useEffect`, so the component threw
 * `useRef is not defined` the moment it rendered. The unit tests all passed —
 * they exercise the pure calculation modules, not the components — and the
 * failure only appeared in a browser.
 *
 * A DOM test environment would catch it too, at the cost of jsdom and a
 * testing library. For this class of mistake the static check is the better
 * trade: it is a hundred lines, it runs in milliseconds, and the failure it
 * catches is a missing import rather than a behavioural difference.
 *
 * It does not replace rendering tests. It catches one specific mistake, which
 * happens to be the one that shipped.
 */

/** The hooks this project uses, and the module each comes from. */
const HOOKS = [
  'useState', 'useEffect', 'useRef', 'useMemo', 'useCallback',
  'useReducer', 'useContext', 'useId', 'useLayoutEffect', 'useTransition',
];

/** Component files: anything under src/ui. */
function componentFiles(dir = 'src/ui') {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry).replaceAll('\\', '/');
    if (statSync(p).isDirectory()) out.push(...componentFiles(p));
    else if (p.endsWith('.jsx')) out.push(p);
  }
  return out;
}

/**
 * The names bound by a file's React imports.
 *
 * Handles both forms this project uses: a named import list, and a default
 * import (which brings `React` itself, letting a component write
 * `React.useMemo` — also checked).
 */
function reactBindings(src) {
  const named = new Set();
  let hasDefault = false;

  // `import React, { a, b } from 'react'` and `import { a, b } from 'react'`.
  for (const m of src.matchAll(/import\s+([^;]+?)\s+from\s+'react'/g)) {
    const clause = m[1];
    if (!clause.trimStart().startsWith('{')) hasDefault = true;
    const braces = clause.match(/\{([^}]*)\}/);
    if (braces) {
      for (const name of braces[1].split(',')) {
        const clean = name.trim().split(/\s+as\s+/).pop();
        if (clean) named.add(clean);
      }
    }
  }
  return { named, hasDefault };
}

/** Hook names called in the file, whether bare or as `React.x`. */
function hooksUsed(src) {
  const used = new Set();
  for (const hook of HOOKS) {
    // A call, not a mention in a comment or a string.
    const bare = new RegExp(`(?:^|[^\\w.])${hook}\\s*\\(`, 'm');
    const qualified = new RegExp(`React\\.${hook}\\s*\\(`, 'm');
    if (bare.test(src)) used.add({ name: hook, qualified: qualified.test(src) && !new RegExp(`(?:^|[^\\w.])${hook}\\s*\\(`, 'm').test(src.replace(new RegExp(`React\\.${hook}`, 'g'), '')) });
  }
  return used;
}

describe('React imports', () => {
  const files = componentFiles();

  it('should find the component files', () => {
    // A glob that silently matched nothing would make every check below pass.
    expect(files.length).toBeGreaterThan(10);
  });

  it('should import every hook it calls', () => {
    const problems = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const { named, hasDefault } = reactBindings(src);

      for (const hook of HOOKS) {
        const calledBare = new RegExp(`(?:^|[^\\w.])${hook}\\s*\\(`, 'm').test(src);
        const calledQualified = new RegExp(`React\\.${hook}\\s*\\(`, 'm').test(src);

        if (calledBare && !calledQualified && !named.has(hook)) {
          problems.push(`${file}: calls ${hook}() but does not import it`);
        }
        if (calledQualified && !hasDefault && !named.has(hook)) {
          problems.push(`${file}: calls React.${hook}() but does not import React`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('should not import a hook it never calls', () => {
    // An unused import is dead weight in the bundle and a sign the code moved
    // on without the import following.
    const problems = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const { named } = reactBindings(src);
      for (const name of named) {
        if (!HOOKS.includes(name)) continue;
        const called = new RegExp(`(?:^|[^\\w.])${name}\\s*\\(`, 'm').test(src);
        if (!called) problems.push(`${file}: imports ${name} but never calls it`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('should import React itself in every component that uses JSX', () => {
    // The project builds with the automatic runtime, so this is not strictly
    // required — but a file that uses React.useMemo without importing React
    // fails at runtime, and that is the same class of bug as the one above.
    const problems = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const { hasDefault, named } = reactBindings(src);
      if (/React\.\w/.test(src) && !hasDefault) {
        // A named import of the thing being accessed is fine too.
        const accessed = [...src.matchAll(/React\.(\w+)/g)].map((m) => m[1]);
        const missing = accessed.filter((a) => !named.has(a));
        if (missing.length > 0) {
          problems.push(`${file}: uses React.${missing[0]} without importing React`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
