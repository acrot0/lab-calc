import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MATERIAL, MATERIALS,
  applyMaterial, detectMaterial, prefersSolid,
} from '../src/ui/material.mjs';

/** A localStorage stand-in, matching the shape history.mjs and theme.mjs use. */
function store(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), has: (k) => m.has(k) };
}

/** A minimal document-element stand-in that records what was set on it. */
function root() {
  return { dataset: {} };
}

describe('material choice', () => {
  it('should default to frosted', () => {
    expect(DEFAULT_MATERIAL).toBe('frosted');
    expect(detectMaterial(null)).toBe('frosted');
    expect(detectMaterial(undefined)).toBe('frosted');
  });

  it('should accept either material', () => {
    for (const m of MATERIALS) expect(detectMaterial(m)).toBe(m);
  });

  it('should fall back to the default for an unrecognised value', () => {
    // A value from an older build, or a corrupted store. Returning null would
    // leave the document with no `data-material` and the CSS tokens unset.
    for (const bad of ['glass', '', 'FROSTED', 'null', 0, {}]) {
      expect(detectMaterial(bad), String(bad)).toBe(DEFAULT_MATERIAL);
    }
  });

});

describe('applyMaterial', () => {
  it('should publish the material as a data attribute', () => {
    const el = root();
    applyMaterial(el, 'frosted');
    expect(el.dataset.material).toBe('frosted');
    applyMaterial(el, 'solid');
    expect(el.dataset.material).toBe('solid');
  });

  it('should normalise an unrecognised value rather than writing it', () => {
    const el = root();
    applyMaterial(el, 'marble');
    expect(el.dataset.material).toBe(DEFAULT_MATERIAL);
  });

  it('should tolerate a missing document element', () => {
    // Server-side or an early call before the root exists; must not throw.
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
