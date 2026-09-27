import { describe, it, expect } from 'vitest';
import {
  visibleCount,
  easeOut,
  prefersReducedMotion,
  sizeCanvas,
  DRAW_MS,
} from '../src/ui/chart-animate.mjs';

describe('visibleCount', () => {
  it('should return the whole series when progress is complete', () => {
    expect(visibleCount(1, 40)).toBe(40);
  });

  it('should return the whole series when progress overshoots', () => {
    expect(visibleCount(1.5, 40)).toBe(40);
  });

  it('should return the whole series for a non-finite progress', () => {
    expect(visibleCount(NaN, 40)).toBe(40);
    expect(visibleCount(Infinity, 40)).toBe(40);
  });

  it('should never return zero once progress is above zero', () => {
    for (const p of [0.001, 0.01, 0.02, 0.04]) {
      expect(visibleCount(p, 40)).toBeGreaterThanOrEqual(1);
    }
  });

  it('should return one point at the very start of the reveal', () => {
    expect(visibleCount(0, 40)).toBe(1);
  });

  it('should grow monotonically as progress increases', () => {
    const counts = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map((p) => visibleCount(p, 40));
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
  });

  it('should never exceed the series length', () => {
    for (const p of [0, 0.3, 0.7, 0.99, 1]) {
      expect(visibleCount(p, 7)).toBeLessThanOrEqual(7);
    }
  });

  it('should reach the halfway mark near half the series', () => {
    expect(visibleCount(0.5, 40)).toBe(20);
  });

  it('should round up so a partial point is still drawn', () => {
    // 0.26 * 10 = 2.6 -> three points, because the third is partly revealed and
    // a line segment needs both its ends to exist.
    expect(visibleCount(0.26, 10)).toBe(3);
  });

  it('should return zero for an empty or invalid series', () => {
    expect(visibleCount(0.5, 0)).toBe(0);
    expect(visibleCount(0.5, -3)).toBe(0);
    expect(visibleCount(0.5, NaN)).toBe(0);
  });

  it('should handle a single-point series', () => {
    expect(visibleCount(0.5, 1)).toBe(1);
    expect(visibleCount(1, 1)).toBe(1);
  });
});

describe('easeOut', () => {
  it('should start at zero', () => {
    expect(easeOut(0)).toBe(0);
  });

  it('should end at one', () => {
    expect(easeOut(1)).toBe(1);
  });

  it('should decelerate, passing the midpoint early', () => {
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
  });

  it('should clamp inputs outside the unit interval', () => {
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(2)).toBe(1);
  });

  it('should treat a non-finite input as complete', () => {
    expect(easeOut(NaN)).toBe(1);
  });

  it('should stay within the unit interval throughout', () => {
    for (let i = 0; i <= 20; i++) {
      const v = easeOut(i / 20);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('should be monotonic', () => {
    let prev = -1;
    for (let i = 0; i <= 20; i++) {
      const v = easeOut(i / 20);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('prefersReducedMotion', () => {
  it('should report false where matchMedia does not exist', () => {
    // jsdom has no matchMedia, which is exactly the environment this guard is
    // for: without it every chart test would throw on the missing function.
    const original = globalThis.matchMedia;
    delete globalThis.matchMedia;
    expect(prefersReducedMotion()).toBe(false);
    globalThis.matchMedia = original;
  });

  it('should report true when the media query matches', () => {
    const original = globalThis.matchMedia;
    globalThis.matchMedia = () => ({ matches: true });
    expect(prefersReducedMotion()).toBe(true);
    globalThis.matchMedia = original;
  });

  it('should report false when the media query does not match', () => {
    const original = globalThis.matchMedia;
    globalThis.matchMedia = () => ({ matches: false });
    expect(prefersReducedMotion()).toBe(false);
    globalThis.matchMedia = original;
  });
});

describe('DRAW_MS', () => {
  it('should sit inside the 350ms small-move token', () => {
    expect(DRAW_MS).toBeGreaterThan(0);
    expect(DRAW_MS).toBeLessThanOrEqual(350);
  });
});

/** A canvas stand-in that counts how often its size is written. */
function fakeCanvas() {
  const writes = { width: 0, height: 0, cssWidth: 0, cssHeight: 0, transforms: 0 };
  const ctx = {
    setTransform: () => { writes.transforms++; },
  };
  const canvas = {
    _w: 0,
    _h: 0,
    style: {},
    getContext: () => ctx,
  };
  Object.defineProperty(canvas, 'width', {
    get: () => canvas._w,
    set: (v) => { writes.width++; canvas._w = v; },
  });
  Object.defineProperty(canvas, 'height', {
    get: () => canvas._h,
    set: (v) => { writes.height++; canvas._h = v; },
  });
  Object.defineProperty(canvas.style, 'width', {
    get: () => canvas.style._w ?? '',
    set: (v) => { writes.cssWidth++; canvas.style._w = v; },
  });
  Object.defineProperty(canvas.style, 'height', {
    get: () => canvas.style._h ?? '',
    set: (v) => { writes.cssHeight++; canvas.style._h = v; },
  });
  return { canvas, writes };
}

describe('sizeCanvas', () => {
  it('should scale the backing store by the device pixel ratio', () => {
    const { canvas } = fakeCanvas();
    globalThis.devicePixelRatio = 2;
    sizeCanvas(canvas, 400, 200);
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(400);
    delete globalThis.devicePixelRatio;
  });

  it('should set the css size in unscaled pixels', () => {
    const { canvas } = fakeCanvas();
    sizeCanvas(canvas, 400, 200);
    expect(canvas.style.width).toBe('400px');
    expect(canvas.style.height).toBe('200px');
  });

  it('should not rewrite the backing store when the size is unchanged', () => {
    // The regression this guards: assigning `canvas.width` clears the bitmap
    // and resets the transform even when the value is identical, so a chart
    // drawing once per frame would wipe itself on every frame.
    const { canvas, writes } = fakeCanvas();
    sizeCanvas(canvas, 400, 200);
    const first = { ...writes };
    sizeCanvas(canvas, 400, 200);
    sizeCanvas(canvas, 400, 200);
    expect(writes.width).toBe(first.width);
    expect(writes.height).toBe(first.height);
  });

  it('should still resize when the requested size changes', () => {
    const { canvas, writes } = fakeCanvas();
    sizeCanvas(canvas, 400, 200);
    const before = writes.width;
    sizeCanvas(canvas, 500, 200);
    expect(writes.width).toBeGreaterThan(before);
    expect(canvas.width).toBe(500);
  });

  it('should apply the device pixel ratio as the transform every call', () => {
    // The transform is reset by the backing-store assignment, so unlike the
    // size it has to be reapplied unconditionally.
    const { canvas, writes } = fakeCanvas();
    sizeCanvas(canvas, 400, 200);
    sizeCanvas(canvas, 400, 200);
    expect(writes.transforms).toBe(2);
  });

  it('should return null when the canvas has no 2d context', () => {
    const canvas = { width: 0, height: 0, style: {}, getContext: () => null };
    expect(sizeCanvas(canvas, 400, 200)).toBeNull();
  });

  it('should return the context when one is available', () => {
    const { canvas } = fakeCanvas();
    expect(sizeCanvas(canvas, 400, 200)).toBeTruthy();
  });
});
