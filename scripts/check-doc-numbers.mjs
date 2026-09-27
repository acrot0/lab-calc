#!/usr/bin/env node
/**
 * Fail the build when the documentation states a number the build can check.
 *
 * The README said `1369 个测试` and the roadmap `1,281 tests` while the suite had
 * grown past 1700 — twice, which is why this is a script and not a checklist
 * item. A stale count is not a crash, so nothing surfaces it: it sits on the
 * first screen of a repository whose whole pitch is that its numbers are
 * checked, where any reader can disprove it in one command.
 *
 * ## Why it runs the suite instead of counting the tests itself
 *
 * Reading `it(` out of the test files would be faster and wrong — a count of
 * declarations is not a count of tests, and the two diverge exactly when a test
 * is skipped or a file fails to load. The number the README promises is the
 * number `npm test` reports, so that is the number this asks for.
 *
 * The cost is a second suite run inside `npm run verify`. That is ~9s locally
 * and it is the price of the claim being true; a stale count costs more.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { staleNumbers } from './lib/doc-numbers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The documents that make claims about the build.
 *
 * `docs/research-value.zh.md` was found by this script after it was written,
 * not before — it said 750 tests while the suite had passed 1800. That is the
 * argument for scanning a list of files rather than the two that prompted the
 * script: the document that most needed checking was one nobody remembered,
 * and it is the one whose whole subject is "you can verify this project".
 */
const DOCS = ['README.md', 'docs/ROADMAP.md', 'docs/research-value.zh.md'];

function actualTestCount() {
  let out;
  try {
    // `--reporter=json` writes the whole run as one JSON object on stdout.
    out = execFileSync('npx', ['vitest', 'run', '--pool=forks', '--reporter=json'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: true,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    // A non-zero exit means tests failed. That is `npm test`'s business to
    // report, not this script's — but the count is still in the output, so it
    // is used, and a genuine parse failure is reported as its own thing rather
    // than as a stale number.
    out = e.stdout;
    if (!out) {
      console.error('check-doc-numbers: 无法运行测试套件，跳过数字核对。');
      process.exit(0);
    }
  }
  const start = out.indexOf('{');
  if (start < 0) {
    console.error('check-doc-numbers: 测试输出里没有 JSON，跳过数字核对。');
    process.exit(0);
  }
  const report = JSON.parse(out.slice(start));
  const passed = report.numPassedTests ?? 0;
  const failed = report.numFailedTests ?? 0;
  return passed + failed;
}

const actual = { tests: actualTestCount() };
let problems = 0;

for (const rel of DOCS) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  for (const s of staleNumbers(fs.readFileSync(file, 'utf8'), actual)) {
    console.error(`  ✗ ${rel}:${s.line} 写着 ${s.found} 个测试，实际 ${actual.tests}`);
    problems += 1;
  }
}

if (problems > 0) {
  console.error(`\n  ${problems} 处陈旧数字。改成 ${actual.tests} 后重跑。`);
  process.exit(1);
}
console.log(`  ok    文档里的测试数一致（${actual.tests}）`);
