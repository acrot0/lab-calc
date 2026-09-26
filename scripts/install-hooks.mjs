#!/usr/bin/env node
/**
 * Install the repository's git hooks.
 *
 * Hooks live in `.git/hooks/`, which git does not track, so a fresh clone has
 * none. This writes them, and it is run from `prepare` in package.json so a
 * clone gets them on `npm install` without anyone having to know they exist.
 *
 * ## What is installed
 *
 * `commit-msg` → `scripts/check-authorship.mjs`. It rejects a message that
 * credits an AI as an author. The same check runs from `npm run verify`, so a
 * clone that never installed hooks still cannot publish the mistake — the hook
 * is the earlier, friendlier of two gates rather than the only one.
 *
 * ## Why not husky
 *
 * One hook, one line of shell. Husky brings a dependency, a config file and a
 * `prepare` script that fails on a machine without git — for a hook that is a
 * single exec call. Writing the file is less machinery than configuring a
 * framework to write it.
 *
 * Existing hooks are left alone: if `.git/hooks/commit-msg` exists and is not
 * ours, this says so and does nothing rather than overwriting whatever the
 * developer put there.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS = path.join(ROOT, '.git', 'hooks');
const MARKER = 'lab-calc: check-authorship';

const BODY = `#!/bin/sh
# ${MARKER}
# Installed by scripts/install-hooks.mjs. Rejects a commit message that credits
# an AI as an author; see the script for why.
exec node "$(git rev-parse --show-toplevel)/scripts/check-authorship.mjs" "$1"
`;

// A worktree has `.git` as a file, and a clone made without git has none.
if (!fs.existsSync(HOOKS)) {
  // Not a git checkout, or a git too old to use .git/hooks. Either way there is
  // nothing to install and nothing to complain about.
  process.exit(0);
}

const target = path.join(HOOKS, 'commit-msg');

if (fs.existsSync(target)) {
  const existing = fs.readFileSync(target, 'utf8');
  if (!existing.includes(MARKER)) {
    console.warn(`  ! ${path.relative(ROOT, target)} 已存在且不是本仓库安装的，跳过`);
    process.exit(0);
  }
}

fs.writeFileSync(target, BODY, { mode: 0o755 });
console.log('  ok    commit-msg 钩子已安装（拒绝 AI 署名）');
