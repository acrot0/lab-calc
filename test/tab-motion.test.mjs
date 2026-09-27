import { describe, it, expect } from 'vitest';
import { tabDirection } from '../src/ui/tab-motion.mjs';

const ORDER = ['a', 'b', 'c', 'd', 'e'];

describe('tabDirection', () => {
  it('should report forward when moving to a later tab', () => {
    expect(tabDirection('a', 'c', ORDER)).toBe(1);
  });

  it('should report backward when moving to an earlier tab', () => {
    expect(tabDirection('c', 'a', ORDER)).toBe(-1);
  });

  it('should report no movement for the same tab', () => {
    expect(tabDirection('c', 'c', ORDER)).toBe(0);
  });

  it('should report forward for a single step right', () => {
    expect(tabDirection('a', 'b', ORDER)).toBe(1);
  });

  it('should report backward for a single step left', () => {
    expect(tabDirection('b', 'a', ORDER)).toBe(-1);
  });

  it('should treat the wraparound from last to first as forward', () => {
    // The case the arrow keys hit most often: `nextTab` from the last entry
    // wraps to the first, which is one step forward and n-1 steps backward.
    // Reading the raw index difference would slide it the wrong way.
    expect(tabDirection('e', 'a', ORDER)).toBe(1);
  });

  it('should treat the wraparound from first to last as backward', () => {
    expect(tabDirection('a', 'e', ORDER)).toBe(-1);
  });

  it('should report no movement for an unknown source tab', () => {
    expect(tabDirection('zzz', 'c', ORDER)).toBe(0);
  });

  it('should report no movement for an unknown destination tab', () => {
    expect(tabDirection('c', 'zzz', ORDER)).toBe(0);
  });

  it('should report no movement for an order shorter than two', () => {
    expect(tabDirection('a', 'b', ['a'])).toBe(0);
    expect(tabDirection('a', 'b', [])).toBe(0);
  });

  it('should report no movement when the order is not an array', () => {
    expect(tabDirection('a', 'b', null)).toBe(0);
    expect(tabDirection('a', 'b', undefined)).toBe(0);
  });

  it('should be symmetric: reversing the trip flips the sign', () => {
    for (const from of ORDER) {
      for (const to of ORDER) {
        if (from === to) continue;
        expect(tabDirection(to, from, ORDER)).toBe(-tabDirection(from, to, ORDER));
      }
    }
  });

  it('should never travel more than half the list in the chosen direction', () => {
    for (const from of ORDER) {
      for (const to of ORDER) {
        if (from === to) continue;
        const a = ORDER.indexOf(from);
        const b = ORDER.indexOf(to);
        const steps = tabDirection(from, to, ORDER) === 1
          ? (b - a + ORDER.length) % ORDER.length
          : (a - b + ORDER.length) % ORDER.length;
        expect(steps).toBeLessThanOrEqual(Math.floor(ORDER.length / 2));
      }
    }
  });

  it('should handle an even-length order without favouring either side', () => {
    // With four tabs the two directions are equidistant; the tie must resolve
    // the same way every time or the animation becomes non-deterministic.
    const even = ['a', 'b', 'c', 'd'];
    expect(tabDirection('a', 'c', even)).toBe(tabDirection('a', 'c', even));
    expect([1, -1]).toContain(tabDirection('a', 'c', even));
  });
});
