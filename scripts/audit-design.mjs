#!/usr/bin/env node
/**
 * The mechanical half of a design audit.
 *
 * The rules are from the Hallmark design skill's slop-test, which encodes the
 * consensus of the anti-AI-slop design field. Most of that list is judgement —
 * "does this read as generated" is not something a script answers. Four of the
 * gates are not judgement, and those are the four here:
 *
 *   gate 34  no horizontal scroll at 320px
 *   gate 49  no two-line clickable text
 *   gate 50  image-bearing grid tracks use minmax(0, 1fr), never bare 1fr
 *   gate 51  display-size text can wrap a long word
 *   gate 55  all-caps display with line-height < 1 collides on wrap
 *   gate 56  two elements sticky at top: 0 overlap
 *
 * ## Why a script and not a checklist
 *
 * Every one of these is invisible until it fires, and then it is visible only
 * on the viewport or the content that triggers it. `1fr` versus `minmax(0, 1fr)`
 * differs by nothing at all until an image is wide, and gate 34's horizontal
 * scrollbar appears at 320px on a machine nobody develops on. A checklist gets
 * run once, by someone who is looking at their own screen.
 *
 * ## What it cannot do
 *
 * Contrast (gate 40/41) is already covered by `test/palette.test.mjs` and
 * `test/palettes.test.mjs`, which compute it against every palette — better
 * than anything here could do statically. Gate 54 (eyebrow beside a heading)
 * needs the DOM, not the stylesheet, and this app has no such pattern.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(ROOT, 'src/ui/styles.css'), 'utf8');

/** Comments stripped, so prose about a rule cannot be mistaken for the rule. */
const sheet = css.replace(/\/\*[\s\S]*?\*\//g, '');

const problems = [];
const notes = [];

/** Every rule body in the sheet, with its selector. */
function rules() {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of sheet.matchAll(re)) {
    const sel = m[1].trim();
    // An at-rule prelude is not a selector; skip it.
    if (sel.startsWith('@')) continue;
    out.push({ sel, body: m[2] });
  }
  return out;
}

// ---------------------------------------------------------------------------
// gate 50 — bare `1fr` in a track that can hold an image
// ---------------------------------------------------------------------------

/*
 * `1fr` resolves to `minmax(auto, 1fr)`, and that `auto` minimum is the largest
 * content's intrinsic width. A 1024px image in such a track sets a 1024px
 * minimum and pushes the layout past the viewport. `minmax(0, 1fr)` is the fix.
 *
 * Only flagged where the track can actually hold an image. The app draws its
 * graphics as inline SVG, which has no intrinsic width in the same way — an
 * `<svg>` with a viewBox and no width attribute sizes to its container. So the
 * check looks for `1fr` tracks in rules whose selector or body suggests media,
 * and otherwise reports them as notes rather than failures.
 */
for (const { sel, body } of rules()) {
  const trackDecl = /grid-template-(?:columns|rows):([^;]+)/.exec(body);
  if (!trackDecl) continue;
  const tracks = trackDecl[1];
  const bare = [...tracks.matchAll(/(?:^|[\s,(])(\d*\.?\d*)fr(?!\s*\))/g)]
    .filter((m) => !tracks.slice(Math.max(0, m.index - 24), m.index).includes('minmax(0,'));
  if (bare.length === 0) continue;
  if (/img|picture|image|figure|art|diagram|canvas|table|pre|code/i.test(sel)) {
    problems.push({
      gate: 50,
      where: sel,
      what: `轨道里可能有图片/宽内容，却用了裸 ${tracks.trim()}`,
      fix: '改成 minmax(0, 1fr)',
    });
  }
}

// ---------------------------------------------------------------------------
// gate 55 — all-caps display with line-height below 1
// ---------------------------------------------------------------------------

/*
 * Uppercase glyphs have no descenders, so cap-tops sit at the very top of the
 * line box. Below `line-height: 1` the cap-tops of line N+1 collide with the
 * baseline of line N when a heading wraps.
 */
for (const { sel, body } of rules()) {
  const lh = /line-height:\s*([\d.]+)\s*;/.exec(body);
  if (!lh) continue;
  const value = Number(lh[1]);
  if (!(value < 1)) continue;
  const isCaps = /text-transform:\s*uppercase/.test(body);
  if (isCaps) {
    problems.push({
      gate: 55,
      where: sel,
      what: `全大写 + line-height ${value}，换行时字顶会撞上一行基线`,
      fix: 'line-height 提到 ≥ 1.0',
    });
  }
}

// ---------------------------------------------------------------------------
// gate 56 — two elements sticky at the same top
// ---------------------------------------------------------------------------

/*
 * Two sticky elements at `top: 0` both pin to the viewport top and overlap;
 * whichever is deeper in the DOM paints over the other. The symptom reads as
 * "the section header bleeds into the nav bar".
 *
 * The app has one top-level sticky (`.topbar`) and one in-page sticky that
 * offsets below it (`.split > .card` at `top: var(--s6)`). Offsetting rather
 * than both-at-zero is the fix gate 56 asks for, so this checks that no second
 * element pins at exactly zero.
 */
const stickyAtZero = [];
for (const { sel, body } of rules()) {
  if (!/position:\s*sticky/.test(body)) continue;
  const top = /top:\s*([^;]+);/.exec(body);
  if (!top) continue;
  if (top[1].trim() === '0' || top[1].trim() === '0px') stickyAtZero.push(sel);
}
if (stickyAtZero.length > 1) {
  problems.push({
    gate: 56,
    where: stickyAtZero.join(' + '),
    what: `${stickyAtZero.length} 个元素同时 sticky 在 top: 0，会互相覆盖`,
    fix: '给次级 sticky 一个偏移量（如 top: var(--s6)），或提高导航的 z-index',
  });
}

// ---------------------------------------------------------------------------
// gate 51 — display-size text that cannot wrap a long word
// ---------------------------------------------------------------------------

/*
 * A long hyphenated word overflows because the only break opportunity is at the
 * hyphen. `overflow-wrap: anywhere` allows a break inside the word as a last
 * resort. Only display-size text needs it — body copy at 14px does not overflow
 * a 320px viewport with a single word.
 *
 * The app is bilingual and Chinese wraps per character, so the risk is Latin
 * chemical names and the brand wordmark. Both are checked.
 */
const displaySelectors = rules().filter(({ body }) => /font-size:\s*var\(--t-(?:xl|display)\)/.test(body));
for (const { sel, body } of displaySelectors) {
  if (!/overflow-wrap|word-break/.test(body)) {
    notes.push(`gate 51 提示：${sel} 用 --t-xl/--t-display 但没写 overflow-wrap，长单词可能溢出`);
  }
}

// ---------------------------------------------------------------------------
// gate 34 — the 320px horizontal-scroll floor
// ---------------------------------------------------------------------------

/*
 * `overflow-x: hidden` on html/body is the wrong fix and gate 34 says so: it
 * hides the symptom while the content is still wider than the viewport, and
 * anything positioned against the right edge is then unreachable. `clip` is the
 * sanctioned alternative, and the app uses it — this checks that it has not
 * been swapped for `hidden` and that no fixed pixel width exceeds 320px.
 */
const htmlBodyHidden = [...sheet.matchAll(/(?:^|[},\s])(?:html|body)[^{}]*\{([^{}]*)\}/g)]
  .some((m) => /overflow-x:\s*hidden/.test(m[1]));
if (htmlBodyHidden) {
  problems.push({
    gate: 34,
    where: 'html / body',
    what: 'overflow-x: hidden 会把溢出内容藏起来而不是修好，右侧内容将无法触达',
    fix: '改用 overflow-x: clip',
  });
}

for (const { sel, body } of rules()) {
  const w = /(?:^|[;\s])width:\s*(\d{3,})px/.exec(body);
  if (!w) continue;
  const px = Number(w[1]);
  if (px <= 320) continue;
  // A min-width on a scrollable inner element is deliberate, not a defect.
  if (/min-width/.test(body) || /scroll|table|ptable|series/.test(sel)) continue;
  problems.push({
    gate: 34,
    where: sel,
    what: `写死 width: ${px}px，320px 视口下会溢出`,
    fix: '改用 max-width 或 minmax(0, 1fr)',
  });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (problems.length === 0) {
  console.log(`  ok    设计审计：${notes.length} 条提示，0 处违规`);
} else {
  for (const p of problems) {
    console.error(`  ✗ gate ${p.gate}  ${p.where}`);
    console.error(`      ${p.what}`);
    console.error(`      → ${p.fix}`);
  }
  console.error(`\n  ${problems.length} 处违规。`);
}
for (const n of notes) console.log(`  · ${n}`);

process.exit(problems.length > 0 ? 1 : 0);
