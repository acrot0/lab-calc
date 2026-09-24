import { describe, it, expect } from 'vitest';
import {
  THEMES,
  THEME_KEY,
  detectTheme,
  resolveTheme,
  loadTheme,
  saveTheme,
  nextTheme,
  applyTheme,
} from '../src/ui/theme.mjs';

const store = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

describe('detectTheme', () => {
  it('should prefer a stored choice', () => {
    expect(detectTheme(true, 'light')).toBe('light');
    expect(detectTheme(false, 'dark')).toBe('dark');
  });

  it('should follow the OS preference when nothing is stored', () => {
    expect(detectTheme(true, null)).toBe('dark');
    expect(detectTheme(false, null)).toBe('light');
  });

  it('should default to dark when the preference is unknown', () => {
    // The app was designed dark-first and it is the better default next to a
    // bench; an unknown preference should not flip it to a bright screen.
    expect(detectTheme(undefined, null)).toBe('dark');
    expect(detectTheme(null, null)).toBe('dark');
  });

  it('should ignore a stored value that is not a real theme', () => {
    expect(detectTheme(true, 'sepia')).toBe('dark');
    expect(detectTheme(false, 'neon')).toBe('light');
  });

  it('should only ever return a theme it supports', () => {
    for (const stored of ['dark', 'light', 'x', null, undefined]) {
      for (const os of [true, false, undefined]) {
        expect(Object.keys(THEMES)).toContain(detectTheme(os, stored));
      }
    }
  });
});

describe('resolveTheme', () => {
  it('should resolve "system" to the OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('should pass an explicit theme through unchanged', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('should treat an unknown preference as system', () => {
    expect(resolveTheme(undefined, true)).toBe('dark');
  });
});

describe('theme persistence', () => {
  it('should round-trip a choice', () => {
    const s = store();
    saveTheme(s, 'light');
    expect(loadTheme(s)).toBe('light');
  });

  it('should return null when nothing is stored', () => {
    expect(loadTheme(store())).toBeNull();
  });

  it('should not throw when storage is unavailable', () => {
    const hostile = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => {} };
    expect(loadTheme(hostile)).toBeNull();
    expect(saveTheme(hostile, 'dark')).toBe(false);
  });

  it('should use a versioned key', () => {
    expect(THEME_KEY).toMatch(/\.v\d+$/);
  });

  it('should allow storing the system preference', () => {
    const s = store();
    saveTheme(s, 'system');
    expect(loadTheme(s)).toBe('system');
  });
});

describe('nextTheme', () => {
  it('should cycle dark → light → system → dark', () => {
    // Cycling through three states rather than toggling two means a user who
    // wants "follow my OS" can get back to it without clearing storage.
    expect(nextTheme('dark')).toBe('light');
    expect(nextTheme('light')).toBe('system');
    expect(nextTheme('system')).toBe('dark');
  });

  it('should never get stuck', () => {
    let t = 'dark';
    const seen = new Set();
    for (let i = 0; i < 6; i++) { t = nextTheme(t); seen.add(t); }
    expect(seen.size).toBe(3);
  });
});

describe('applyTheme', () => {
  it('should set the attribute on the given root', () => {
    const root = { dataset: {}, style: {} };
    applyTheme(root, 'dark');
    expect(root.dataset.theme).toBe('dark');
  });

  it('should also record the resolved theme for CSS to key off', () => {
    const root = { dataset: {}, style: {} };
    applyTheme(root, 'light');
    expect(root.dataset.theme).toBe('light');
  });

  it('should set the browser theme-color so mobile chrome matches', () => {
    const root = { dataset: {}, style: {} };
    applyTheme(root, 'light');
    expect(root.dataset.themeResolved).toBe('light');
  });

  it('should not throw when given no root', () => {
    expect(() => applyTheme(null, 'dark')).not.toThrow();
  });
});

describe('THEMES', () => {
  it('should offer exactly the three supported modes', () => {
    expect(Object.keys(THEMES).sort()).toEqual(['dark', 'light', 'system']);
  });

  it('should label each mode', () => {
    for (const [k, v] of Object.entries(THEMES)) {
      expect(v.zh, `${k} zh`).toBeTruthy();
      expect(v.en, `${k} en`).toBeTruthy();
    }
  });
});
