#!/usr/bin/env node
/**
 * Fail a release whose assets do not match what the README promises.
 *
 * ## Why this exists
 *
 * The README's 「怎么装」 table promised four ways to get the app. Measured
 * against the published releases: v0.9.1 and v0.9.2 carried **one** — the Tauri
 * installer — while the table still offered an Android APK and an Electron zip
 * that were not attached. The same table called the Tauri build 「待构建」,
 * which had stopped being true two releases earlier.
 *
 * Nothing failed: the release published, the assets uploaded, the page looked
 * finished. The only reader who finds out is the one who clicks the file the
 * table told them to click, and the failure they see is a 404 on a project
 * whose whole argument is that its numbers are checked.
 *
 * So the check runs where the two can actually be compared — in the release
 * workflow, against the release that was just created. A local `npm run verify`
 * cannot do this: there is no release yet, and reaching GitHub from a build
 * machine that may be offline is not a check, it is a flaky test.
 *
 * ## Usage
 *
 *   node scripts/check-release-assets.mjs            # latest published release
 *   node scripts/check-release-assets.mjs v0.9.2     # a specific tag
 *
 * Needs `gh` authenticated. A missing tag or a failed API call exits 0 with a
 * message rather than failing — this guards publishing, it does not gate it.
 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tag = process.argv[2] ?? null;

/*
 * What the README's install table offers, and how each is recognised in a
 * release's asset list.
 *
 * A matcher rather than an exact filename because the names carry the version
 * and the packaging scripts spell them differently on purpose (the Tauri
 * installer is named after `productName`, the Electron zip after the app
 * directory). Pinning the full string here would make this script the thing
 * that breaks on a version bump.
 */
const PROMISED = [
  { row: 'Android APK', match: (a) => /^lab-calc-.*\.apk$/.test(a) },
  { row: 'Windows 安装包（Tauri）', match: (a) => /-setup\.exe$/.test(a) },
  { row: 'Windows 免安装（Electron）', match: (a) => /win-x64\.zip$/.test(a) },
];

/*
 * The spaceship is load-bearing: a full-width parenthesis in a regex literal is
 * fine, but the README's row label contains one and reading it back out of the
 * table needs the same text. Kept as data above rather than parsed from the
 * README, because the table is prose and this is a contract.
 */

/** Every artifact the README promises, present in the release's assets? */
function check(assets) {
  return PROMISED.map(({ row, match }) => ({
    row,
    ok: assets.some(match),
    found: assets.filter(match),
  }));
}

function releaseAssets(ref) {
  const args = ['release', 'view'];
  if (ref) args.push(ref);
  args.push('--json', 'assets,tagName');
  const out = execFileSync('gh', args, {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  // `gh release view` with no argument resolves "latest", which is what a
  // reader of the README gets when they click through.
  return JSON.parse(out);
}

let release;
try {
  release = releaseAssets(tag);
} catch (e) {
  console.error(`check-release-assets: 查不到 release（${tag ?? 'latest'}），跳过。`);
  console.error(String(e.stderr ?? e.message).split('\n')[0]);
  process.exit(0);
}

const assets = (release.assets ?? []).map((a) => a.name);
const name = release.tagName ?? tag ?? 'latest';
const rows = check(assets);
const missing = rows.filter((r) => !r.ok);

if (missing.length === 0) {
  console.log(`  ok    ${name} 带齐了 README 承诺的全部产物（${assets.length} 个附件）`);
  process.exit(0);
}

console.error(`\n  ✗ ${name} 缺了 README 承诺的产物：\n`);
for (const r of missing) console.error(`      ${r.row}`);
console.error(`\n  实际附件：${assets.join(', ') || '（空）'}`);
console.error(
  '\n  两种诚实做法，选一种：\n'
  + '    · 把产物打出来并传上去（scripts/package-android.mjs / package-desktop.mjs）\n'
  + '    · 把 README 那一行删掉或改成实际提供的\n'
  + '  不要留着那一行——点进去 404 的是用户，不是构建。\n',
);
process.exit(1);
