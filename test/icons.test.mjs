import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The icon set is checked as source rather than rendered.
 *
 * Rendering would need a DOM and a React root for what is really a question
 * about the source: does every tab have its own glyph, and is every icon the
 * same size and weight. Reading the files answers that directly.
 */

/**
 * Paths are normalised to forward slashes.
 *
 * `join` produces backslashes on Windows, so an assertion written against a
 * literal path would pass on one machine and fail on another — and CI runs
 * Linux while this is developed on Windows.
 */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(jsx|js|mjs)$/.test(entry)) out.push(p.replaceAll('\\', '/'));
  }
  return out;
}

const SRC = walk('src');

describe('icon set', () => {
  it('should give every tab its own icon', () => {
    // "Dilute" and "Serial dilution" both used Droplets until this was fixed.
    // Two identical glyphs in a tab bar are not navigation.
    const app = readFileSync('src/ui/App.jsx', 'utf8');
    const icons = [...app.matchAll(/\{ id: '(\w+)', icon: Icons\.(\w+)/g)]
      .map(([, id, icon]) => ({ id, icon }));
    expect(icons.length).toBeGreaterThan(10);

    const seen = new Map();
    for (const { id, icon } of icons) {
      expect(seen.has(icon), `${id} reuses ${icon}, already used by ${seen.get(icon)}`)
        .toBe(false);
      seen.set(icon, id);
    }
  });

  it('should name every tab icon in the set', () => {
    const icons = readFileSync('src/ui/icons.jsx', 'utf8');
    const app = readFileSync('src/ui/App.jsx', 'utf8');
    for (const [, name] of app.matchAll(/icon: Icons\.(\w+)/g)) {
      expect(icons, `Icons.${name} is used but not defined`).toMatch(new RegExp(`\\b${name}:`));
    }
  });

  it('should import lucide icons in exactly one file', () => {
    // The point of the wrapper is that the choice of glyph and its size live in
    // one place. A second import site is how the eight-size drift started.
    const importers = SRC.filter((f) => readFileSync(f, 'utf8').includes("from 'lucide-react'"));
    expect(importers).toEqual(['src/ui/icons.jsx']);
  });

  it('should not let a component pick its own icon size', () => {
    // Sizes had drifted to eight values with no rule behind them. A literal
    // size outside the wrapper is how that happens again.
    const offenders = [];
    for (const file of SRC) {
      if (file.endsWith('icons.jsx')) continue;
      // Illustrations are hand-drawn SVG, not icons, and their dimensions are
      // drawing coordinates rather than typography.
      if (file.endsWith('Illustrations.jsx')) continue;
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/<(?:Icons\.\w+|\w*Icon)\s[^>]*?size=\{(\d+)\}/g)) {
        offenders.push(`${file}: size={${m[1]}}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('should expose a three-step size scale', () => {
    const icons = readFileSync('src/ui/icons.jsx', 'utf8');
    const sizes = [...icons.matchAll(/^\s{2}(\w+): (\d+),$/gm)].map(([, k, v]) => [k, Number(v)]);
    expect(sizes.map(([k]) => k)).toEqual(['inline', 'control', 'display']);
    // Ascending, so a caller reading the names in order gets the visual order.
    const values = sizes.map(([, v]) => v);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });

  it('should set one stroke width for the whole set', () => {
    const icons = readFileSync('src/ui/icons.jsx', 'utf8');
    // Exactly one declaration, applied by the wrapper — a per-icon stroke is
    // the same drift as a per-icon size, one level down.
    const strokes = [...icons.matchAll(/strokeWidth=\{([^}]+)\}/g)].map((m) => m[1]);
    expect(strokes).toEqual(['STROKE']);
  });
});
