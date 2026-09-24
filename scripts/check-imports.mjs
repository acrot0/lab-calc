#!/usr/bin/env node
/**
 * Flag imported names that are never used in the file body.
 *
 * Why this exists: when App.jsx was split into tab modules, `AlertTriangle`
 * was left out of Fields.jsx. The bundler still built successfully — the
 * failure only appeared at runtime as "AlertTriangle is not defined", which
 * blanked the entire page. A build passing is not evidence that the app works.
 *
 * This is a deliberately small check, not a replacement for a linter. It
 * catches the specific mistake of moving code and losing an import, which is
 * exactly the mistake a refactor makes.
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

/** Names brought in by `import { a, b as c } from '...'`. */
function importedNames(src) {
  const names = [];
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.push(name);
    }
  }
  return names;
}

const stripImports = (src) => src.replace(/import\s*\{[^}]+\}\s*from\s*['"][^'"]+['"];?/g, '');

let issues = 0;
for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, 'utf8');
  const body = stripImports(src);
  for (const name of new Set(importedNames(src))) {
    const re = new RegExp(`\\b${name}\\b`);
    if (!re.test(body)) {
      console.log(`  ${file}: ${name}`);
      issues++;
    }
  }
}

if (issues === 0) {
  console.log('  OK: every imported name is used');
  process.exit(0);
}
console.log(`\n  ${issues} unused import(s)`);
process.exit(1);
