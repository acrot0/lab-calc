#!/usr/bin/env node
/**
 * Refuse a commit message that credits an AI as an author.
 *
 * ## Why this is a script and not just a hook
 *
 * `.git/hooks/` is not version-controlled, so a hook alone lives on one machine
 * and disappears on a fresh clone. This is the check; `scripts/install-hooks.mjs`
 * wires it into `commit-msg`, and `npm run verify` calls it too — so a clone
 * that never installed the hook still fails the build rather than publishing
 * the mistake.
 *
 * ## Why the rule exists
 *
 * The project has one author. A `Co-Authored-By` trailer crediting a tool is
 * not a courtesy, it is a claim about who wrote the work, and it is wrong. The
 * distinction that matters: this project *is* about Claude Code Router, so the
 * word "Claude" appears in legitimate text all over it. The check looks for
 * authorship claims, not for the word.
 *
 * Usage:
 *   node scripts/check-authorship.mjs <file>   # check one message file
 *   node scripts/check-authorship.mjs --all    # check every commit on HEAD
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

/**
 * Patterns that claim authorship or generation.
 *
 * Deliberately narrow. A pattern like `/claude/i` would reject this very file,
 * the README's description of the CCR gateway, and half the repository's prose.
 * Each of these matches a phrase that can only be an attribution.
 */
const FORBIDDEN = [
  /^\s*Co-Authored-By:\s*Claude/im,
  /Generated with \[?Claude Code\]?/i,
  /🤖\s*Generated with/i,
  /^\s*Co-Authored-By:.*\b(anthropic|openai|gemini|copilot)\b/im,
];

/** The lines that violate the rule, or an empty array. */
function offences(text) {
  const found = [];
  for (const pattern of FORBIDDEN) {
    const m = pattern.exec(text);
    if (m) found.push(m[0].trim());
  }
  return found;
}

const args = process.argv.slice(2);

if (args.includes('--all')) {
  /*
   * Every commit on HEAD, checked as a batch.
   *
   * `%B` gives the full message including trailers. `--no-pager` keeps the
   * output pipeable, and the separator is a NUL so a message containing the
   * separator cannot split a commit in two.
   */
  const log = execFileSync('git', ['--no-pager', 'log', '--format=%H%x00%B%x00'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const parts = log.split('\0');
  let bad = 0;
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const sha = parts[i].trim();
    const msg = parts[i + 1] ?? '';
    if (!/^[0-9a-f]{7,40}$/.test(sha)) continue;
    const found = offences(msg);
    if (found.length > 0) {
      bad++;
      console.error(`  ${sha.slice(0, 8)}  ${found.join('; ')}`);
    }
  }
  if (bad > 0) {
    console.error(`\n${bad} 个提交含 AI 署名。用户是唯一作者，见 docs/NEXT-SESSION.md。\n`);
    process.exit(1);
  }
  console.log('  ok    no AI attribution in any commit');
  process.exit(0);
}

const file = args[0];
if (!file) {
  console.error('用法: node scripts/check-authorship.mjs <commit-msg-file> | --all');
  process.exit(2);
}

let message;
try {
  message = fs.readFileSync(file, 'utf8');
} catch {
  // A missing message file is not this check's problem to report.
  process.exit(0);
}

// A comment line is git's own guidance and is stripped before the commit is
// made, so a `Co-Authored-By` mentioned in a comment is not an attribution.
const effective = message
  .split('\n')
  .filter((l) => !l.startsWith('#'))
  .join('\n');

const found = offences(effective);
if (found.length > 0) {
  console.error(
    '\n提交被拒：提交信息里出现了 AI 署名。\n'
    + `  匹配到：${found.join('; ')}\n\n`
    + '  本仓库只有一位作者，提交信息里不得出现 Co-Authored-By 或\n'
    + '  Generated with 形式的 AI 署名。删掉那一行后重新提交。\n',
  );
  process.exit(1);
}
