import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { applyMaterial, prefersSolid } from '../src/ui/material.mjs';

/*
 * Which surfaces the frosted material actually reaches.
 *
 * The app has one material switch, driven by the OS's "reduce transparency"
 * preference, and it is deliberately opt-in per surface: `MaterialContext`
 * writes `data-material` on the document element and a handful of chrome rules
 * read `--chrome` from it.
 *
 * The failure this guards against is a surface that *looks* frosted because it
 * carries a `backdrop-filter` of its own, while sitting outside the block that
 * defines what frosted means. The mobile nav did exactly that:
 *
 *   - It read `var(--chrome)`, so in frosted mode it was translucent — good.
 *   - Its `backdrop-filter: blur(12px)` was declared outside the `@supports`
 *     block, so it blurred in **both** modes. In solid mode the background is
 *     opaque and the blur is invisible, which means a full-surface GPU pass
 *     every frame for nothing.
 *   - It never got the `saturate(180%)` the topbar and rail carry, so the same
 *     material rendered two ways in one viewport.
 *
 * The blur is also the expensive one of the set — the browser samples
 * everything behind the element and redoes it whenever anything moves — so a
 * surface that blurs without needing to is the most costly kind of drift.
 */

const css = readFileSync('src/ui/styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Selectors carrying a backdrop-filter outside any @supports block. */
function unconditionalBlurs() {
  const out = [];
  // Walk the sheet tracking @supports depth, so a declaration inside one is
  // not counted as unconditional.
  const re = /@supports[^{]*\{|\}|([^{}@]+)\{([^{}]*)\}/g;
  let depth = 0;
  for (const m of css.matchAll(re)) {
    if (m[0] === '}') { depth = Math.max(0, depth - 1); continue; }
    if (m[0].startsWith('@supports')) { depth += 1; continue; }
    if (!m[2]) continue;
    if (!/backdrop-filter/.test(m[2])) continue;
    if (depth === 0) out.push({ sel: m[1].trim(), body: m[2] });
  }
  return out;
}

describe('the frosted material', () => {
  it('should not blur a surface unconditionally', () => {
    /*
     * A blur outside `@supports` runs even where the material is solid, and
     * even in a browser that cannot composite it well. The frosted block exists
     * so that both decisions are made in one place.
     */
    const offenders = unconditionalBlurs().filter(
      // The scrim is the exception: it is a full-viewport dimming layer whose
      // whole job is the blur, and it is only ever rendered behind a modal.
      ({ sel }) => !/scrim/.test(sel),
    );
    expect(
      offenders.map((o) => o.sel),
      '这些选择器在 @supports 外声明了 backdrop-filter，纯色模式下也会模糊',
    ).toEqual([]);
  });

  it('should give every frosted chrome surface the same treatment', () => {
    /*
     * The topbar, the rail and the mobile nav are one material. A surface that
     * reads `--chrome` but skips the blur stack renders as a flat translucent
     * panel beside two frosted ones — visible whenever the nav and the topbar
     * are on screen together, which on a phone is always.
     */
    const frostedBlock = css.slice(
      css.indexOf('@supports (backdrop-filter: blur(1px))'),
      css.indexOf('@supports not (', css.indexOf('@supports (backdrop-filter: blur(1px))')),
    );
    for (const surface of ['.topbar', '.rail', '.mobile-nav']) {
      expect(frostedBlock, `${surface} 不在毛玻璃覆盖列表里`).toContain(surface);
    }
  });

  it('should keep the content cards out of it', () => {
    /*
     * The cards stay opaque on purpose: all six palettes were contrast-checked
     * against `--surface`, and a translucent card would put body text over the
     * page gradient, invalidating that check for every theme at once.
     */
    const frostedBlock = css.slice(
      css.indexOf('@supports (backdrop-filter: blur(1px))'),
      css.indexOf('@supports not (', css.indexOf('@supports (backdrop-filter: blur(1px))')),
    );
    expect(frostedBlock, '内容卡片不该被毛玻璃覆盖').not.toMatch(/\.card\b/);
  });

  it('should degrade to the opaque surface without backdrop-filter support', () => {
    // A translucent panel with no blur is worse than no effect: the content
    // shows through and the text loses its contrast.
    const fallback = css.slice(css.indexOf('@supports not ('));
    expect(fallback).toMatch(/--chrome:\s*var\(--surface\)/);
  });
});

/*
 * The material switch itself.
 *
 * `applyMaterial` is the only writer of `data-material`, and every surface rule
 * matches on that attribute. If it publishes a name the CSS does not know, the
 * document ends up with no material at all — not the default one — and the
 * chrome loses its `--chrome` token entirely rather than falling back.
 */
describe('applyMaterial', () => {
  /** A minimal document-element stand-in that records what was set on it. */
  const root = () => ({ dataset: {} });

  it('should publish the material as a data attribute', () => {
    const el = root();
    applyMaterial(el, 'frosted');
    expect(el.dataset.material).toBe('frosted');
    applyMaterial(el, 'solid');
    expect(el.dataset.material).toBe('solid');
  });

  it('should fall back to the default for an unrecognised value', () => {
    // A value from an older build, or a corrupted provider. Publishing it
    // verbatim would leave the document with a `data-material` no rule matches,
    // so the chrome would render unstyled rather than solid.
    for (const bad of ['glass', '', 'FROSTED', 'null', 0, {}, undefined]) {
      const el = root();
      applyMaterial(el, bad);
      expect(el.dataset.material, String(bad)).toBe('frosted');
    }
  });

  it('should tolerate a missing document element', () => {
    // Server-side, or an early call before the root exists; must not throw.
    expect(() => applyMaterial(null, 'frosted')).not.toThrow();
    expect(() => applyMaterial(undefined, 'solid')).not.toThrow();
    expect(() => applyMaterial({}, 'solid')).not.toThrow();
  });
});

describe('prefersSolid', () => {
  const win = (matches) => ({ matchMedia: () => ({ matches }) });

  it('should report the OS reduce-transparency setting', () => {
    expect(prefersSolid(win(true))).toBe(true);
    expect(prefersSolid(win(false))).toBe(false);
  });

  it('should default to false when the query is unsupported', () => {
    // An unsupported media query must not silently switch every user to solid.
    expect(prefersSolid({})).toBe(false);
    expect(prefersSolid({ matchMedia: undefined })).toBe(false);
  });

  it('should survive a matchMedia that throws', () => {
    const bad = { matchMedia: () => { throw new Error('unsupported query'); } };
    expect(prefersSolid(bad)).toBe(false);
  });
});
