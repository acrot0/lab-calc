#!/usr/bin/env node
/**
 * Flag import mistakes in both directions.
 *
 * Unused imports, and — the more damaging one — names used but never imported.
 *
 * Why the second direction exists: a helper was added to a tab and called
 * without adding it to that file's import list. The bundler built fine, the
 * page threw `fmtSci is not defined` on render, and React unmounted the whole
 * tree. Same class of failure as the unused-import case below, opposite
 * direction, and a build passing is no evidence either way.
 *
 * This is a deliberately small check, not a replacement for a linter. It
 * catches the specific mistakes a refactor makes: moving code and losing an
 * import, or using a helper the file never brought in.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] ?? 'src';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * Names brought in by a static or dynamic destructured import.
 *
 * The dynamic form is matched too, because it is a real pattern in this
 * codebase and not an accident: `xlsx.mjs` and the print report are loaded on
 * demand so they stay out of the first download, and both are written as
 * `await import('...')` or `import('...').then(...)`.
 *
 * Without this, the checker reported a dynamic import as an undefined call —
 * a false positive that would push a future author to either duplicate the
 * import statically (undoing the split) or silence the check. Teaching it the
 * syntax is the fix that keeps the check worth running.
 */
function importedNames(src) {
  const names = [];
  const patterns = [
    // import { a, b as c } from '...'
    /import\s*\{([^}]+)\}\s*from/g,
    // const { a, b } = await import('...')  /  const { a } = await import('…')
    /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*await\s+import\s*\(/g,
    // .then(({ a, b }) => …)
    /\.then\s*\(\s*\(\s*\{([^}]+)\}\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      for (const raw of m[1].split(',')) {
        const name = raw.trim().split(/\s+as\s+/).pop().trim();
        if (name) names.push(name);
      }
    }
  }
  return names;
}

const stripImports = (src) => src
  .replace(/import\s*\{[^}]+\}\s*from\s*['"][^'"]+['"];?/g, '')
  .replace(/(?:const|let|var)\s*\{[^}]+\}\s*=\s*await\s+import\s*\([^)]*\);?/g, '')
  .replace(/\.then\s*\(\s*\(\s*\{[^}]+\}\s*\)/g, '.then((');

/**
 * Remove comments and quoted strings, leaving only code.
 *
 * A name mentioned in a doc comment or a translated phrase is not a call, and
 * without this the check reported `elementBySymbol('D')` from a comment and the
 * English word "dilution" from a translation file.
 *
 * Only quotes that start and end on the same line are stripped. A template
 * literal spanning lines would otherwise have to be matched by a pattern that
 * backtracks across the whole file, and an earlier version of this did exactly
 * that and swallowed the declarations it was meant to find — turning the check
 * into three false reports. Matching line by line cannot run away.
 */
function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

/**
 * Every name the project's own modules export.
 *
 * Used to recognise a bare identifier as something that should have been
 * imported, rather than as a local or a global. Asking about unknown
 * identifiers in general would flag every browser global and every React hook;
 * restricting the question to names this project exports keeps it clean.
 */
function projectExports() {
  const names = new Set();
  for (const file of walk(ROOT)) {
    const src = fs.readFileSync(file, 'utf8');
    const re = /export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g;
    for (const m of src.matchAll(re)) names.add(m[1]);
  }
  return names;
}

/** Names a file brings in, by any import form this project uses. */
function boundNames(src) {
  const names = new Set(importedNames(src));
  for (const m of src.matchAll(/import\s+([A-Za-z_$][\w$]*)\s*(?:,|from)/g)) names.add(m[1]);
  return names;
}

const EXPORTS = projectExports();

let issues = 0;
for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, 'utf8');
  const body = stripImports(src);
  const bound = boundNames(src);

  for (const name of new Set(importedNames(src))) {
    const re = new RegExp(`\\b${name}\\b`);
    if (!re.test(body)) {
      console.log(`  ${file}: imports ${name} but never uses it`);
      issues++;
    }
  }

  /*
   * The other direction: a project export called here that this file never
   * imported. A helper added to a tab and called without being added to its
   * import list throws `x is not defined` at render, and React unmounts the
   * whole tree — a blank page. The bundler reports nothing, because a bare
   * identifier is legal JavaScript.
   *
   * Comments and string literals are stripped first. Without that the check
   * reported `elementBySymbol('D')` mentioned in a doc comment and the English
   * word "dilution" in a translation file — both false, and a check that cries
   * wolf is one people learn to ignore.
   */
  const code = stripCommentsAndStrings(body);
  // `export` is part of the declaration, so the pattern allows for it —
  // otherwise a module's own exported helpers look like names it failed to
  // import, and every file with an export reports itself.
  const declared = new Set(
    [...code.matchAll(/(?:^|\s)(?:export\s+)?(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g)]
      .map((m) => m[1]),
  );
  for (const name of EXPORTS) {
    if (bound.has(name) || declared.has(name)) continue;
    if (new RegExp(`(?<![.\\w])${name}\\s*\\(`).test(code)) {
      console.log(`  ${file}: uses ${name}() but never imports it`);
      issues++;
    }
  }
}

if (issues === 0) {
  console.log('  OK: imports are used, and used names are imported');
  process.exit(0);
}
console.log(`\n  ${issues} unused import(s)`);
process.exit(1);
