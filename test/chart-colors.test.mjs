import { describe, it, expect } from 'vitest';
import { chartColors } from '../src/ui/chart-colors.mjs';
import { PALETTE_KEYS, PALETTES } from '../src/ui/palettes.mjs';

/**
 * Chart colours are derived from the palette, and the bug this guards against
 * is the one the derivation replaced.
 *
 * Every canvas chart took a `theme` prop and looked it up in a map with exactly
 * two entries, `dark` and `light`. The prop is the palette key, so all the
 * other palettes fell through to the dark defaults — a white grid on a cream
 * card. It was invisible because the two themes the map contained were the two
 * everyone checked by hand.
 */

describe('chartColors', () => {
  it('should return a colour for every palette, not a fallback', () => {
    // The property that was broken: no palette may silently get another's
    // colours. Two palettes legitimately share a value only if their tokens do.
    for (const key of PALETTE_KEYS) {
      const c = chartColors(key);
      expect(c.curve, key).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c.grid, key).toBeTruthy();
      expect(c.label, key).toBeTruthy();
    }
  });

  it('should give different colours to palettes that differ', () => {
    // The regression test proper: before the fix, every key other than `light`
    // returned the same object as `dark`.
    const dark = chartColors('dark');
    const gruvbox = chartColors('gruvbox');
    const solarizedLight = chartColors('solarized-light');
    const latte = chartColors('catppuccin-latte');

    expect(gruvbox.curve).not.toBe(dark.curve);
    expect(solarizedLight.curve).not.toBe(dark.curve);
    expect(latte.curve).not.toBe(dark.curve);
  });

  it('should take the curve colour from the palette accent', () => {
    // So that adding a palette cannot leave the chart behind: there is no list
    // to forget to update.
    for (const key of PALETTE_KEYS) {
      expect(chartColors(key).curve, key).toBe(PALETTES[key].tokens.accent);
    }
  });

  it('should take the grid from the palette grid line', () => {
    for (const key of PALETTE_KEYS) {
      expect(chartColors(key).grid, key).toBe(PALETTES[key].tokens.gridLine);
    }
  });

  it('should take the label from the dim text colour', () => {
    for (const key of PALETTE_KEYS) {
      expect(chartColors(key).label, key).toBe(PALETTES[key].tokens.textDim);
    }
  });

  it('should make the band and marker translucent, not opaque', () => {
    // A solid equivalence band would cover the curve it marks.
    for (const key of PALETTE_KEYS) {
      const c = chartColors(key);
      expect(c.band, key).toMatch(/^rgba\(/);
      expect(c.eq, key).toMatch(/^rgba\(/);
      const alphaOf = (s) => Number(s.slice(s.lastIndexOf(',') + 1, -1));
      expect(alphaOf(c.band), `${key} band`).toBeLessThan(0.2);
      expect(alphaOf(c.eq), `${key} marker`).toBeGreaterThan(alphaOf(c.band));
    }
  });

  it('should fall back to the default palette for an unknown key', () => {
    // A stored theme from an older build, or a corrupted value. Returning
    // undefined would leave the chart drawing in whatever the canvas defaults
    // to, which is black on black in a dark theme.
    const unknown = chartColors('no-such-theme');
    expect(unknown.curve).toBe(PALETTES.dark.tokens.accent);
  });

  it('should be stable across calls', () => {
    // Memoised by the callers, so a new object per call would redraw an
    // unchanged chart on every parent render.
    expect(chartColors('gruvbox')).toEqual(chartColors('gruvbox'));
  });
});
