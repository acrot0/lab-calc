#!/usr/bin/env node
/**
 * Report exports that nothing outside their own file mentions.
 *
 * Why this exists: a refactor that moves a helper to a new module leaves the
 * old export behind, and nothing catches it. The bundler tree-shakes it away,
 * the tests that covered it still pass (they import it directly), and the
 * import checker is one-directional — it flags names used without an import,
 * never names exported without a use.
 *
 * Test-only exports are reported separately rather than as dead: an export that
 * only a test touches is a module's public surface being kept alive by its own
 * test, which is a decision to make deliberately, not by accident.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] ?? 'src';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx|mjs|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const texts = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]));
const testTexts = walk('test').map((f) => fs.readFileSync(f, 'utf8'));
// Non-source consumers: the entry HTML, the build config, the scripts.
const otherTexts = ['index.html', 'vite.config.js', 'vitest.config.ts']
  .filter((f) => fs.existsSync(f))
  .map((f) => fs.readFileSync(f, 'utf8'));

const DECL = /^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

const dead = [];
const testOnly = [];
for (const [file, src] of texts) {
  for (const m of src.matchAll(DECL)) {
    const name = m[1];
    const needle = new RegExp(`\\b${name}\\b`);
    const elsewhere = [...texts].some(([g, s]) => g !== file && needle.test(s))
      || otherTexts.some((s) => needle.test(s));
    if (elsewhere) continue;
    const inTests = testTexts.some((s) => needle.test(s));
    (inTests ? testOnly : dead).push(`${file}:${name}`);
  }
}

if (dead.length === 0) {
  // Test-only exports are reported but do not fail the check: an export kept
  // alive by its own test is a deliberate choice, not a defect. Printing them
  // on every clean run would train the reader to skip the output.
  if (process.argv.includes('--verbose')) {
    console.log(`  ok    no dead exports (${testOnly.length} test-only)`);
    for (const d of testOnly) console.log(`        test-only  ${d}`);
  } else {
    console.log(`  ok    no dead exports (${testOnly.length} kept alive by tests only)`);
  }
  process.exit(0);
}

console.log(`  ${dead.length} dead export(s):`);
for (const d of dead) console.log(`    DEAD       ${d}`);
process.exit(1);
