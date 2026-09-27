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
    for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
      const start = m.index + m[0].length - 1;
      let depth = 0;
      let end = start;
      for (let i = start; i < css.length; i += 1) {
        if (css[i] === '{') depth += 1;
        else if (css[i] === '}') {
          depth -= 1;
          if (depth === 0) { end = i; break; }
        }
      }
      const body = css.slice(start, end);
      for (const prop of ['width', 'height', 'top', 'left', 'right', 'bottom', 'margin', 'padding']) {
        if (new RegExp(`(^|[\\s;{])${prop}\\s*:`, 'm').test(body)) {
          offenders.push(`${m[1]} animates ${prop}`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
