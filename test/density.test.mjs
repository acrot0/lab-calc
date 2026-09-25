import { describe, expect, it } from 'vitest';
import {
  DENSITIES, DEFAULT_DENSITY, DENSITY_SCALE, MIN_TYPE_PX,
  detectDensity, loadDensity, saveDensity, nextDensity, applyDensity,
} from '../src/ui/density.mjs';

describe('density registry', () => {
  it('should offer three densities', () => {
    expect(DENSITIES).toEqual(['comfortable', 'compact', 'spacious']);
  });

  it('should default to comfortable', () => {
    expect(DEFAULT_DENSITY).toBe('comfortable');
    expect(detectDensity(undefined)).toBe('comfortable');
    expect(detectDensity('nonsense')).toBe('comfortable');
  });

  it('should keep every multiplier positive and near 1', () => {
    // Past about 1.2 the fifteen tab labels stop fitting a desktop row and the
    // navigation wraps, which is a worse trade than the extra room buys.
    for (const d of DENSITIES) {
      const s = DENSITY_SCALE[d];
      expect(s.space, `${d} space`).toBeGreaterThan(0.5);
      expect(s.space, `${d} space`).toBeLessThanOrEqual(1.2);
      expect(s.type, `${d} type`).toBeGreaterThan(0.5);
      expect(s.type, `${d} type`).toBeLessThanOrEqual(1.2);
    }
  });

  it('should order the scales so a cycle moves monotonically', () => {
    expect(DENSITY_SCALE.compact.space).toBeLessThan(DENSITY_SCALE.comfortable.space);
    expect(DENSITY_SCALE.comfortable.space).toBeLessThan(DENSITY_SCALE.spacious.space);
  });

  it('should keep the smallest type above the legibility floor', () => {
    /*
     * `--t-xs` is 11.5px at comfortable density. The floor exists because a
     * CJK ideograph loses its internal strokes below about 11px on a low-DPI
     * screen, and running out of legibility is a correctness problem where
     * running out of space is only a layout one.
     */
    const base = 11.5;
    for (const d of DENSITIES) {
      expect(base * DENSITY_SCALE[d].type, `${d} t-xs`)
        .toBeGreaterThanOrEqual(MIN_TYPE_PX - 0.5);
    }
  });

  it('should cycle through all three and back', () => {
    let d = DEFAULT_DENSITY;
    const seen = [];
    for (let i = 0; i < 3; i++) { d = nextDensity(d); seen.push(d); }
    expect(seen).toEqual(['compact', 'spacious', 'comfortable']);
  });
});

describe('persistence', () => {
  const store = () => {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  };

  it('should round-trip a saved density', () => {
    const s = store();
    expect(loadDensity(s)).toBe(DEFAULT_DENSITY);
    saveDensity(s, 'compact');
    expect(loadDensity(s)).toBe('compact');
  });

  it('should survive a store that throws', () => {
    // Private browsing and a full quota both throw on setItem. A preference
    // that cannot be saved must not break the app.
    const bad = { getItem: () => { throw new Error('nope'); }, setItem: () => { throw new Error('nope'); } };
    expect(loadDensity(bad)).toBe(DEFAULT_DENSITY);
    expect(saveDensity(bad, 'compact')).toBe(false);
  });
});

describe('applyDensity', () => {
  const root = () => ({ dataset: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; } } });

  it('should publish the multiplier as a custom property, not the tokens', () => {
    // CSS does the arithmetic with calc(), so the base scale stays the single
    // source and a token added later is scaled automatically.
    const r = root();
    applyDensity(r, 'compact');
    expect(r.dataset.density).toBe('compact');
    expect(r.style.props['--density-space']).toBe('0.8');
    expect(r.style.props['--density-type']).toBe('0.94');
  });

  it('should write 1 for comfortable, matching the stylesheet default', () => {
    const r = root();
    applyDensity(r, 'comfortable');
    expect(r.style.props['--density-space']).toBe('1');
  });

  it('should resolve an unknown density to the default rather than writing NaN', () => {
    const r = root();
    applyDensity(r, 'nonsense');
    expect(r.dataset.density).toBe('comfortable');
    expect(r.style.props['--density-space']).toBe('1');
  });

  it('should no-op without a document rather than throwing', () => {
    expect(() => applyDensity(null, 'compact')).not.toThrow();
    expect(() => applyDensity({}, 'compact')).not.toThrow();
  });
});
