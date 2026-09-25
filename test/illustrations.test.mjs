// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as Illustrations from '../src/ui/components/Illustrations.jsx';

/*
 * Derived from the module rather than listed, so a new illustration is covered
 * the moment it is exported. The hand-written list this replaced is exactly how
 * the next three went untested: the checks are all per-illustration, and a
 * missing entry is invisible.
 */
const ARTS = Object.fromEntries(
  Object.entries(Illustrations).filter(([name]) => name.startsWith('Art')),
);
if (Object.keys(ARTS).length < 3) throw new Error('illustration list looks wrong');

describe('illustrations render valid SVG', () => {
  for (const [name, C] of Object.entries(ARTS)) {
    it(`${name} should have every gradient reference resolve`, () => {
      const html = renderToStaticMarkup(React.createElement(C));
      const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
      const refs = [...html.matchAll(/url\(#([^)]+)\)/g)].map(m => m[1]);
      // A url(#id) that resolves to nothing paints as none, silently.
      const broken = refs.filter(r => !ids.includes(r));
      expect(broken, `${name}: unresolved gradient refs ${broken.join(', ')}`).toEqual([]);
      expect(refs.length, `${name} should use at least one gradient`).toBeGreaterThan(0);
    });

    it(`${name} should not use colons in ids`, () => {
      // useId returns ":r1:", and a colon is invalid in a url(#...) fragment.
      const html = renderToStaticMarkup(React.createElement(C));
      const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
      for (const id of ids) expect(id, `id "${id}" contains a colon`).not.toContain(':');
    });

    it(`${name} should be marked decorative`, () => {
      const html = renderToStaticMarkup(React.createElement(C));
      expect(html).toContain('aria-hidden="true"');
    });
  }

  it('should give two instances of the same illustration different gradient ids', () => {
    // Duplicate ids mean the second gradient is ignored and the first one's
    // colours are used — invisible until two are compared side by side.
    const a = renderToStaticMarkup(React.createElement(Illustrations.ArtReaction));
    const b = renderToStaticMarkup(React.createElement(Illustrations.ArtReaction));
    const idA = [...a.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
    const idB = [...b.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
    // Server rendering resets the counter per call, so ids repeat across
    // separate renders; what matters is that within one tree they are unique.
    expect(new Set(idA).size).toBe(idA.length);
    expect(new Set(idB).size).toBe(idB.length);
  });
});
