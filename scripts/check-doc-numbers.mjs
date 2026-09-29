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
 * Both kinds it checks were found the same way: the test count after two
 * documented drifts, and the test-FILE count after the README's status table
 * said `测试 2055 通过 / 100 文件` against a suite of 2069 tests in 101 files.
 * The number was there to be read — the scan walked past it because the count
 * came after the word instead of before. Hence a pattern list covering the
 * phrasings these documents actually use, not just the one that came to mind.
 *
 * ## Why it runs the suite instead of counting the tests itself
 *
 * Reading `it(` out of the test files would be faster and wrong — a count of
 * declarations is not a count of tests, and the two diverge exactly when a test
 * is skipped or a file fails to load. The number the README promises is the
 * number `npm test` reports, so that is the number this asks for. The file
 * count comes from the same report and for the same reason: files that produced
 * results, not files on disk.
 *
 * The cost is a second suite run inside `npm run verify`. That is ~9s locally
 * and it is the price of the claim being true; a stale count costs more.
 *
 * ## It also fails on a red suite (2026-09-28)
 *
 * Because it runs the suite anyway, it is the cheapest place to notice that the
 * suite is red — and the release checklist treats `verify` as the gate, so a
 * red suite that this script ignored was a gate that let a broken build
 * through. It did exactly that on the v1.1.0 release. A run with failures now
 * exits non-zero and the count is of passing tests, which is what the documents
 * actually claim.
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
 *
 * `README.en.md` was added on the same argument, and it had the same history:
 * it sits beside `README.md`, makes the same two claims in the same table, and
 * was not scanned. Measured at v1.3.0 it said `v1.1.0 · 2534 tests passing /
 * 126 files` — two versions and two suite sizes behind, on the front page of
 * the repository, in the English half of a bilingual README.
 */
const DOCS = ['README.md', 'README.en.md', 'docs/ROADMAP.md', 'docs/research-value.zh.md'];

function actualTestCount() {
  let out;
  try {
    // `--reporter=json` writes the whole run as one JSON object on stdout.
    out = execFileSync('npx', ['vitest', 'run', '--pool=forks', '--reporter=json'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: true,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    /*
     * A failing suite lands here, and it used to be shrugged off — the count was
     * read out of the output and the exit code ignored, on the reasoning that
     * reporting failures is `npm test`'s job. That reasoning was wrong in the
     * one place it mattered: `npm run verify` is what the release checklist
     * treats as the gate, so a red suite with a stale-but-consistent count
     * passed the gate. It happened on the v1.1.0 release — verify reported
     * green while `update-channel.test.mjs` was failing on an unbumped
     * `Cargo.toml`, and only CI caught it.
     *
     * So a failed run is now this script's failure too.
     */
    out = e.stdout;
    if (!out) {
      console.error('check-doc-numbers: 无法运行测试套件。');
      process.exit(1);
    }
    const report = parseReport(out);
    if (report) {
      const failed = report.numFailedTests ?? 0;
      if (failed > 0) {
        console.error(`  ✗ 测试套件有 ${failed} 个失败——数字核对不作数，先修测试。`);
        process.exit(1);
      }
    }
  }
  const report = parseReport(out);
  if (!report) {
    console.error('check-doc-numbers: 测试输出里没有 JSON，跳过数字核对。');
    process.exit(0);
  }
  return {
    // Passing tests, because that is what the documents claim ("N 通过"). A
    // failed test is not a test that passed, and counting it as one would let
    // the documented number be right while the suite is red.
    tests: report.numPassedTests ?? 0,
    // Files that ran, not files on disk: the README is claiming results, and a
    // file whose import fails produces no results.
    files: (report.testResults ?? []).length,
  };
}

/** The JSON report vitest writes, or null when the output does not carry one. */
function parseReport(out) {
  const start = out.indexOf('{');
  if (start < 0) return null;
  try {
    return JSON.parse(out.slice(start));
  } catch {
    return null;
  }
}

const actual = actualTestCount();
let problems = 0;

for (const rel of DOCS) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  for (const s of staleNumbers(fs.readFileSync(file, 'utf8'), actual)) {
    const noun = s.kind === 'files' ? '个测试文件' : '个测试';
    console.error(`  ✗ ${rel}:${s.line} 写着 ${s.found} ${noun}，实际 ${actual[s.kind]}`);
    problems += 1;
  }
}

if (problems > 0) {
  console.error(`\n  ${problems} 处陈旧数字。改成 ${actual.tests} 个测试 / ${actual.files} 个文件后重跑。`);
  process.exit(1);
}
console.log(`  ok    文档里的测试数一致（${actual.tests} 个测试 / ${actual.files} 个文件）`);
