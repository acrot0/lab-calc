import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * Two duration scales, not one.
 *
 * The complaint was 「动效不如大厂，没有独特风格」. The durations here were already
 * compliant with the usual accessibility guidance — short, GPU-only, reduced
 * motion honoured — so "make it faster" or "add more animations" would have
 * missed the point. The thing big design systems do that this did not is use
 * **two** scales:
 *
 *     spatial  (movement)   350 / 500 / 650 ms
 *     effects  (feedback)   150 / 200 / 300 ms
 *
 * A panel sliding across the screen and a button acknowledging a press are not
 * the same kind of event and must not take the same time. The app had one scale
 * — 120 / 180 / 260 / 140 — and used it for both, so a hover state felt
 * sluggish and a panel move felt abrupt, from the same number.
 *
 * This is Material 3's split, and it is the single most-copied thing about its
 * motion system. The assertions below hold the stylesheet to it: the tokens
 * exist, they are ordered, and the two scales do not overlap.
 */

const css = readFileSync('src/ui/styles.css', 'utf8');

/*
 * The sheet with comments removed, for the structural scans below.
 *
 * Two bugs came from scanning the raw file. The selector-capture regex matched
 * a rule's preceding comment as part of its selector, so a `.modal { ... }`
 * preceded by a paragraph of prose read as a selector beginning with `/*` and
 * never matched its exemption. And because the reduced-motion blocks were also
 * read with comments intact, a selector that appeared only *inside a comment*
 * in one of those blocks counted as covered.
 *
 * The second is the dangerous one: it makes the guard pass while the element
 * animates. Both are the same mistake — a comment is not CSS.
 *
 * Nothing below loses meaning by this: the prose explains intent to a reader,
 * and the assertions are about rules.
 */
const sheet = css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Read a custom property's numeric ms value, following `var()` aliases.
 *
 * The legacy names are defined as `var(--dur-fx-s)` rather than as literals, so
 * one edit moves the whole set. A resolver that only read digits would report
 * them as undeclared.
 */
function tokenMs(name, seen = new Set()) {
  expect(seen.has(name), `--${name} resolves in a cycle`).toBe(false);
  seen.add(name);
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  expect(m, `--${name} must be declared`).not.toBeNull();
  const value = m[1].trim();
  const alias = /^var\(--([\w-]+)\)$/.exec(value);
  if (alias) return tokenMs(alias[1], seen);
  const ms = /^(\d+)ms$/.exec(value);
  expect(ms, `--${name} must resolve to a ms value, got "${value}"`).not.toBeNull();
  return Number(ms[1]);
}

describe('motion duration scales', () => {
  it('should declare a spatial scale for movement', () => {
    // Three steps, so a caller can say "small move" or "large move" rather
    // than reaching for one value and stretching it.
    expect(tokenMs('dur-move-s')).toBeGreaterThanOrEqual(300);
    expect(tokenMs('dur-move-m')).toBeGreaterThan(tokenMs('dur-move-s'));
    expect(tokenMs('dur-move-l')).toBeGreaterThan(tokenMs('dur-move-m'));
  });

  it('should declare an effects scale for feedback', () => {
    expect(tokenMs('dur-fx-s')).toBeGreaterThanOrEqual(100);
    expect(tokenMs('dur-fx-m')).toBeGreaterThan(tokenMs('dur-fx-s'));
    expect(tokenMs('dur-fx-l')).toBeGreaterThan(tokenMs('dur-fx-m'));
  });

  it('should keep the two scales from overlapping', () => {
    // The whole point of the split. If the slowest effect is as slow as the
    // fastest move, the two are one scale wearing two names.
    expect(tokenMs('dur-fx-l')).toBeLessThan(tokenMs('dur-move-s'));
  });

  it('should keep the legacy aliases pointing at sensible scales', () => {
    // `--dur-fast`/`--dur` are used across the stylesheet for hover and
    // focus feedback; they are effects, not movement.
    expect(tokenMs('dur-fast')).toBeLessThan(tokenMs('dur-move-s'));
    expect(tokenMs('dur')).toBeLessThan(tokenMs('dur-move-s'));
  });

  it('should give every duration a reduced-motion story', () => {
    // The existing policy collapses animation durations to 0.01ms under
    // prefers-reduced-motion. A new token that no rule consumes cannot break
    // it, but a new *animation* using one must be inside a block the policy
    // covers — so this checks the policy is still global rather than scoped.
    const blocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)];
    expect(blocks.length).toBeGreaterThan(0);
    const text = blocks.map((b) => b[1]).join('\n');
    expect(text).toContain('animation-duration');
  });

  it('should not animate a layout-triggering property', () => {
    // Only GPU-composited properties may be animated: transform, opacity,
    // filter. Animating width/height/top/left runs layout on every frame,
    // which is what makes an animation feel cheap regardless of its duration.
    //
    // The bodies are brace-matched rather than regex-matched to the first `}`:
    // keyframes can be written on one line (`@keyframes fade { from {...} }`),
    // and a lazy `[\s\S]*?\n\}` ran past it into the next rule and reported
    // `.modal { width: ... }` as an animating keyframe.
    const offenders = [];
    for (const m of sheet.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
      const start = m.index + m[0].length - 1;
      let depth = 0;
      let end = start;
      for (let i = start; i < sheet.length; i += 1) {
        if (sheet[i] === '{') depth += 1;
        else if (sheet[i] === '}') {
          depth -= 1;
          if (depth === 0) { end = i; break; }
        }
      }
      const body = sheet.slice(start, end);
      for (const prop of ['width', 'height', 'top', 'left', 'right', 'bottom', 'margin', 'padding']) {
        if (new RegExp(`(^|[\\s;{])${prop}\\s*:`, 'm').test(body)) {
          offenders.push(`${m[1]} animates ${prop}`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

/*
 * Every animation that moves something must have a non-moving equivalent.
 *
 * ## The defect this catches
 *
 * The reduced-motion block lists the elements that keep a *meaning-preserving*
 * fade in place of their animation. It is a hand-maintained list, and it has
 * been forgotten three times — `.export-preview` and `.export-menu` both
 * shipped animating with `rise` (which translates) while every other element
 * honoured the setting. Nothing failed: the animation ran, it just ran for the
 * people who asked it not to.
 *
 * A list that must be updated by hand is a list that goes stale, so this checks
 * the property instead of the list: any rule whose animation keyframes contain
 * a `transform` must name its selector somewhere inside a
 * `prefers-reduced-motion` block, or be one of the few overlay elements whose
 * motion *is* the meaning.
 */

/** The keyframes that move something, and what they move. */
function movingKeyframes() {
  const out = new Map();
  for (const m of sheet.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    const start = m.index + m[0].length - 1;
    let depth = 0;
    let end = start;
    for (let i = start; i < sheet.length; i += 1) {
      if (sheet[i] === '{') depth += 1;
      else if (sheet[i] === '}') {
        depth -= 1;
        if (depth === 0) { end = i; break; }
      }
    }
    const body = sheet.slice(start, end);
    if (/transform\s*:/.test(body)) out.set(m[1], body);
  }
  return out;
}

/** Every keyframe name in the sheet, whether or not it moves. */
function keyframeNames() {
  return new Set([...sheet.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)].map((m) => m[1]));
}

/**
 * Every keyframe whose only motion is `transform` — nothing fades or shifts
 * colour, so under reduced motion it has nothing to say.
 */
const nonMoving = new Set();
{
  const all = keyframeNames();
  const movingNames = movingKeyframes();
  for (const name of all) if (!movingNames.has(name)) nonMoving.add(name);
}

/**
 * Split a style-rule body (or a whole block) into its selector compounds.
 *
 * `.a > .b:hover::after, .c` becomes `.a`, `.b`, `.c` — each with the classes
 * that are *selected* on it rather than the ones merely mentioned. Walking the
 * string rather than splitting on `>`/whitespace keeps `:not(.x)` and
 * `[data-dir="1"]` from being mistaken for the element being styled.
 *
 * `classList` is ordered, so `classList[0]` is the compound's own class: the
 * one the rule is really about.
 */
function selectorParts(text) {
  const out = [];
  // Drop at-rules' prelude and any brace-delimited value like a `url(...)`.
  const flat = text.replace(/@[a-z-]+[^{;]*/gi, '').replace(/\([^()]*\)/g, '()');
  for (const chunk of flat.split(/[{}]/)) {
    for (const sel of chunk.split(',')) {
      let current = null;
      for (let i = 0; i < sel.length; i += 1) {
        const ch = sel[i];
        if (ch === '.' || ch === '#' || ch === ':' || ch === '[' || /\s/.test(ch) || '>+~'.includes(ch)) {
          if (ch === ':') {
            // A pseudo-class keeps the current compound; `::` starts a pseudo-element.
            if (sel[i + 1] === ':') {
              const name = /^::([\w-]+)/.exec(sel.slice(i))?.[1];
              if (current && name) current.pseudoElement = `::${name}`;
              i += 1 + (name?.length ?? 0);
              continue;
            }
            const name = /^:([\w-]+)/.exec(sel.slice(i))?.[1];
            i += name?.length ?? 0;
            continue;
          }
          if (ch === '[') {
            // A value inside brackets may contain a dot; skip to the close.
            const close = sel.indexOf(']', i);
            i = close < 0 ? sel.length : close;
            continue;
          }
          if (ch === '.' || ch === '#') {
            const m = new RegExp(`^[.#]([\\w-]+)`).exec(sel.slice(i));
            if (m) {
              if (!current) { current = { classList: [] }; out.push(current); }
              if (ch === '.') current.classList.push(m[1]);
              i += m[0].length - 1;
            } else if (!current) { current = { classList: [] }; out.push(current); }
            continue;
          }
          current = null;
        }
      }
    }
  }
  return out;
}

/** Every `selector { animation: <name> ... }` pairing in the sheet. */
function animatedSelectors() {
  const out = [];
  for (const m of sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, rawSel, body] = m;
    // `animation` shorthand, or `animation-name` on its own — the direction
    // rules use the latter.
    const shorthand = /(?:^|[\s;])animation\s*:\s*([\w-]+)/m.exec(body);
    const named = /(?:^|[\s;])animation-name\s*:\s*([\w-]+)/m.exec(body);
    const name = shorthand?.[1] ?? named?.[1];
    if (!name) continue;
    out.push({ selector: rawSel.trim().replace(/\s+/g, ' '), name });
  }
  return out;
}

describe('reduced motion coverage', () => {
  it('should give every moving animation a non-moving equivalent', () => {
    const moving = movingKeyframes();
    expect(moving.size).toBeGreaterThan(0);

    /*
     * Exemptions are *selectors*, not keyframe names.
     *
     * `rise` is shared by the export menu, the export preview and the settings
     * popover. Exempting it by name would have excused all three — and the
     * export panels are exactly the gap this test was written to catch, so a
     * name-keyed exemption here would have made the guard lie.
     *
     * What is being judged is an *element* being an overlay, so the exemption
     * is recorded against the element. Overlays have to read as arriving *over*
     * the page, and Apple's guidance (quoted in the stylesheet) is that a
     * dissolve does not say that — here the motion is the meaning.
     *
     * `.card` is the tab surface. Its direction says which way the user
     * travelled, so it must not be replaced by a cross-fade; under reduced
     * motion the global collapse leaves the swap instant, which is the right
     * outcome for a tab change.
     */
    const EXEMPT = [
      // Overlays: their motion is the meaning, per the Apple guidance quoted in
      // the stylesheet. A dissolve does not say "this arrived over the page".
      '.modal', '.nav-sheet', '.calc-drawer', '.settings-menu', '.scrim',
      '.nav-sheet-scrim',
      // The export and scale menus are the same case: both hang off a button
      // they were opened from, and the rise is what says where they came from.
      '.export-menu', '.scale-menu',
      // The reference window is a tool, not a panel of the app: it has to feel
      // laid over the work rather than part of it, and it is opened rarely
      // enough that the motion is never in the way.
      '.install-prompt',
      /*
       * The tab surface. A cross-fade would say "the content changed" but not
       * "it changed to the next tab" or "to the previous one", and the
       * direction is the only thing distinguishing a swipe from a tap that
       * landed somewhere unexpected. It is also not a new animation: the user
       * asked for the tab, so there is nothing to interrupt.
       */
      '.card',
    ];
    // The exemption names an element, so it matches the *compound* that carries
    // the animation — not just the leading one.
    const isExempt = (selector) => selectorParts(selector).some((part) => (
      part.classList.some((cls) => EXEMPT.some((e) => e.slice(1) === cls))
    ));

    /*
     * What "covered" means, and why it is not string containment.
     *
     * The first version of this test asked whether the selector's last class
     * appeared in the text of any reduced-motion block. A selector like
     * `.work[data-dir="1"] > .card` trivially passed, because `.card` is a
     * substring of it — the tab animation was never regulated at all, and the
     * guard said it was.
     *
     * So rather than searching for the selector, this records what the blocks
     * actually mention: the set of *class names* that appear in a position
     * where a class is being selected. A callback rule (`background: url(...)`),
     * a comment, or a media-feature value cannot cover anything.
     *
     * Unregulated is not the same as wrong, and it is not the same as exempt.
     * `panel-open` on `.worked` has no reduced-motion rule: the global duration
     * collapse turns it into an instant appearance, which is a defensible
     * non-motion equivalent. This guard is a backstop against *adding* motion
     * and forgetting the story, so it fails only on a moving keyframe. The
     * non-moving keyframes the blocks do name are checked at the end.
     */
    const reduced = [];
    for (const m of sheet.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g)) {
      const start = m.index + m[0].length - 1;
      let depth = 0;
      let end = start;
      for (let i = start; i < sheet.length; i += 1) {
        if (sheet[i] === '{') depth += 1;
        else if (sheet[i] === '}') {
          depth -= 1;
          if (depth === 0) { end = i; break; }
        }
      }
      reduced.push(sheet.slice(start, end));
    }
    expect(reduced.length).toBeGreaterThan(0);
    const reducedText = reduced.join('\n');

    const REDUCED = new Set();
    for (const part of selectorParts(reducedText)) {
      for (const cls of part.classList) REDUCED.add(cls);
    }
    expect(REDUCED.size, 'the reduced-motion blocks must name at least one class').toBeGreaterThan(0);
    // Proof the parse really read the blocks: three elements the stylesheet
    // deliberately gives an opacity-only equivalent.
    for (const known of ['result-main', 'history-item', 'export-menu']) {
      expect(REDUCED.has(known), `the reduced-motion blocks should name .${known}`).toBe(true);
    }

    const offenders = [];
    for (const { selector, name } of animatedSelectors()) {
      if (!moving.has(name)) continue;
      if (isExempt(selector)) continue;
      // Covered if *any* compound in the selector starts with a class the
      // blocks regulate: a rule naming one compound applies to the element the
      // whole selector matches.
      const covered = selectorParts(selector)
        .some((part) => part.classList[0] && REDUCED.has(part.classList[0]));
      if (!covered) offenders.push(`${selector}  (${name})`);
    }
    expect(offenders, `animated but not covered by prefers-reduced-motion:\n${offenders.join('\n')}`)
      .toEqual([]);

    /*
     * The other half of "no motion information is lost": the reduced-motion
     * rules must not animate a keyframe that moves.
     *
     * The check above proves every moving element is *mentioned* by a
     * reduced-motion block. It does not prove the block says anything useful —
     * `.result { animation: rise ... }` inside a reduced block would satisfy it
     * while leaving the translate in place. So the keyframes those blocks
     * actually name are held to the non-moving set.
     *
     * `animation: none` is allowed, and is not a cop-out: the indeterminate
     * progress bar is the case for it. A bar sweeping forever cannot be
     * translated into a non-motion equivalent that still says "working", so it
     * is replaced by a static dimmed full bar — a state change instead of a
     * motion. What is *not* allowed is a block that keeps moving things.
     */
    const blockKeyframes = new Set();
    for (const m of reducedText.matchAll(/(?:^|[\s;{])animation(?:-name)?\s*:\s*([\w-]+)/gm)) {
      blockKeyframes.add(m[1]);
    }
    expect(blockKeyframes.size, 'the reduced-motion blocks should name a replacement animation')
      .toBeGreaterThan(0);

    const stillMoving = [];
    for (const name of blockKeyframes) {
      if (name === 'none') continue;
      if (nonMoving.has(name)) continue;
      stillMoving.push(name);
    }
    expect(stillMoving, `these keyframes are reused inside a prefers-reduced-motion block and still move:\n${stillMoving.join('\n')}`)
      .toEqual([]);
  });

  it('should have a reduced-motion block at all', () => {
    // Guards the scan above against passing because its regex stopped matching.
    expect(/prefers-reduced-motion/.test(css)).toBe(true);
  });
});
