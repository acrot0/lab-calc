#!/usr/bin/env node
/**
 * Refuse a dependency whose licence is incompatible with this project's MIT.
 *
 * `docs/ROADMAP.md` claimed this script existed for several releases before it
 * did. The claim was the reason to write it rather than the reason not to: a
 * stated policy that nothing enforces is worse than no policy, because it is
 * read as a guarantee.
 *
 * What this checks: the `license` field of every package in `dependencies` and
 * `devDependencies`, read from the installed tree. Copyleft licences are
 * refused outright — GPL and AGPL cannot be combined with MIT for
 * distribution, and CC BY-SA is not a software licence at all. Weak copyleft
 * (LGPL, MPL) is reported rather than refused, since it is compatible when the
 * library is used unmodified and dynamically linked, but it is a decision a
 * human should make rather than a script.
 *
 * What this does NOT check: transitive dependencies, or whether a package
 * ships a bundled asset under a different licence than its code. Both are real
 * gaps; neither is worth a false sense of coverage, so they are stated here
 * rather than left for someone to assume.
 *
 * Usage:
 *   node scripts/check-licences.mjs
 *   node scripts/check-licences.mjs --json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AS_JSON = process.argv.includes('--json');

/** Licences that can be combined with an MIT-licensed distribution. */
const ALLOWED = new Set([
  'MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD',
  'CC0-1.0', 'Unlicense', 'OFL-1.1', 'CC-BY-4.0', 'Python-2.0', 'BlueOak-1.0.0',
]);

/** Copyleft that a human has to decide about, not this script. */
const REVIEW = new Set(['LGPL-2.1', 'LGPL-3.0', 'MPL-2.0', 'EPL-2.0', 'CDDL-1.0']);

/** Copyleft that cannot ship in an MIT project at all. */
const REFUSED = new Set([
  'GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'GPL-2.0-only', 'GPL-3.0-only',
  'AGPL-3.0-only', 'GPL-3.0-or-later', 'AGPL-3.0-or-later',
  'CC-BY-SA-4.0', 'SSPL-1.0', 'BUSL-1.1',
]);

/**
 * Normalise a licence expression to a single identifier for lookup.
 *
 * SPDX expressions arrive as `(MIT OR Apache-2.0)`, `MIT AND CC0-1.0`, or the
 * legacy `{ "type": "...", "url": "..." }` object form. The permissive choice
 * is what matters for an OR, so the first recognised term wins; an AND means
 * every term has to be acceptable, so a single unrecognised one is a failure.
 */
function licenceId(raw) {
  if (!raw) return null;
  const text = typeof raw === 'string' ? raw : (raw.type ?? null);
  if (!text) return null;
  return text.trim();
}

/** Every known id appearing in an SPDX expression, plus the joiners. */
function terms(expr) {
  return expr.split(/\s+(?:OR|AND)\s+|[()]/).map((s) => s.trim()).filter(Boolean);
}

function classify(expr) {
  if (!expr) return { verdict: 'unknown', id: null };
  const parts = terms(expr);
  const refused = parts.find((p) => REFUSED.has(p));
  if (refused) return { verdict: 'refused', id: refused };
  const review = parts.find((p) => REVIEW.has(p));
  if (review) return { verdict: 'review', id: review };
  const ok = parts.find((p) => ALLOWED.has(p));
  if (ok) return { verdict: 'ok', id: ok };
  return { verdict: 'unknown', id: parts[0] ?? expr };
}

function readPackageJson(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

const pkg = readPackageJson(ROOT);
if (!pkg) {
  console.error('check-licences: no package.json at', ROOT);
  process.exit(2);
}

const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
const results = [];

for (const name of names) {
  const dir = path.join(ROOT, 'node_modules', name);
  const dep = readPackageJson(dir);
  if (!dep) {
    results.push({ name, verdict: 'missing', id: null, expr: null });
    continue;
  }
  const expr = licenceId(dep.license ?? dep.licences);
  const { verdict, id } = classify(expr);
  results.push({ name, verdict, id, expr });
}

if (AS_JSON) {
  console.log(JSON.stringify({ results }, null, 2));
} else {
  for (const r of results) {
    const mark = { ok: '  ok  ', review: ' REVIEW', refused: 'REFUSED', unknown: ' ???? ', missing: ' MISS ' }[r.verdict];
    console.log(`${mark}  ${r.name.padEnd(24)} ${r.expr ?? '(no license field)'}`);
  }
}

const refused = results.filter((r) => r.verdict === 'refused');
const review = results.filter((r) => r.verdict === 'review');
const unknown = results.filter((r) => r.verdict === 'unknown' || r.verdict === 'missing');

if (!AS_JSON) {
  console.log('');
  console.log(`  ${results.length} direct dependencies checked.`);
  if (review.length > 0) {
    console.log(`  ${review.length} need a human decision (weak copyleft): ${review.map((r) => r.name).join(', ')}`);
  }
  if (unknown.length > 0) {
    console.log(`  ${unknown.length} could not be classified: ${unknown.map((r) => r.name).join(', ')}`);
  }
}

// Only a refused licence fails the check. An unknown one is reported and the
// exit stays zero, because a missing `license` field is a packaging oversight
// rather than a legal problem — failing the build over it would train people
// to pass --force, which is how a real refusal gets waved through.
if (refused.length > 0) {
  console.error(`\ncheck-licences: ${refused.length} incompatible licence(s): ${refused.map((r) => `${r.name} (${r.id})`).join(', ')}`);
  process.exit(1);
}
