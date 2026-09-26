/**
 * List the keys the two locale dictionaries disagree about.
 *
 * The i18n test fails on a mismatch but reports it as a 1300-element array
 * diff, which does not say which eight keys are wrong. This prints them.
 *
 * Reads the files as text rather than importing them: the locale modules
 * interpolate `__APP_VERSION__`, a build-time global that does not exist under
 * plain Node, so an import throws before any key can be read.
 *
 *   node tools/diff-locales.mjs
 */
import { readFileSync } from 'node:fs';

/** Every leaf key of a locale file, as `a.b.c`, by indentation. */
function keysOf(file) {
  const src = readFileSync(new URL(file, import.meta.url), 'utf8');
  const start = src.indexOf('= {');
  const body = src.slice(start);
  const out = new Set();
  const stack = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^(\s+)([a-zA-Z_$][\w$]*):\s*(.*)$/);
    if (!m) continue;
    const depth = Math.floor(m[1].length / 2);
    const [, , key, rest] = m;
    stack.length = depth;
    stack[depth] = key;
    // A line whose value opens an object is a branch, not a leaf.
    if (/^\{\s*$/.test(rest.trim())) continue;
    out.add(stack.slice(0, depth + 1).join('.'));
  }
  return out;
}

const zk = keysOf('../src/ui/locales/zh.mjs');
const ek = keysOf('../src/ui/locales/en.mjs');

const onlyZh = [...zk].filter((k) => !ek.has(k)).sort();
const onlyEn = [...ek].filter((k) => !zk.has(k)).sort();

console.log(`zh keys: ${zk.size}   en keys: ${ek.size}`);
console.log(`\nonly in zh (${onlyZh.length}):\n  ${onlyZh.join('\n  ') || '(none)'}`);
console.log(`\nonly in en (${onlyEn.length}):\n  ${onlyEn.join('\n  ') || '(none)'}`);
