/**
 * List the error codes the calc layer can throw that the locale files do not
 * translate.
 *
 * The i18n test already fails on this, but it stops at the first missing code.
 * This prints the whole list, which is what you want when a new calc module has
 * just added a batch of them.
 *
 *   node tools/find-missing-error-keys.mjs
 */
import { readdirSync, readFileSync } from 'node:fs';

const calcDir = new URL('../src/calc/', import.meta.url);
const codes = new Set();
for (const file of readdirSync(calcDir).filter((f) => f.endsWith('.mjs'))) {
  const src = readFileSync(new URL(file, calcDir), 'utf8');
  for (const m of src.matchAll(/fail\(\s*'([a-zA-Z]+)'/g)) codes.add(m[1]);
  for (const m of src.matchAll(/code:\s*'([a-zA-Z]+)'/g)) codes.add(m[1]);
}

/** The keys defined in a locale's `errors` block. */
function definedKeys(file) {
  const src = readFileSync(new URL(file, import.meta.url), 'utf8');
  const start = src.indexOf('\n  errors: {');
  if (start < 0) throw new Error(`no errors block in ${file}`);
  const end = src.indexOf('\n  },', start);
  const block = src.slice(start, end);
  return new Set([...block.matchAll(/^\s{4}([a-zA-Z][a-zA-Z0-9]*):/gm)].map((m) => m[1]));
}

const zh = definedKeys('../src/ui/locales/zh.mjs');
const en = definedKeys('../src/ui/locales/en.mjs');

const missingZh = [...codes].filter((c) => !zh.has(c)).sort();
const missingEn = [...codes].filter((c) => !en.has(c)).sort();

console.log(`calc error codes: ${codes.size}`);
console.log(`zh defined: ${zh.size}   en defined: ${en.size}`);
console.log(`\nmissing in zh (${missingZh.length}):\n  ${missingZh.join('\n  ') || '(none)'}`);
console.log(`\nmissing in en (${missingEn.length}):\n  ${missingEn.join('\n  ') || '(none)'}`);

// Codes defined but never thrown are dead weight, and usually mean a rename
// left the old key behind.
const unused = [...zh].filter((c) => !codes.has(c)).sort();
console.log(`\ndefined but never thrown (${unused.length}):\n  ${unused.join('\n  ') || '(none)'}`);
