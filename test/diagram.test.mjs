import { describe, it, expect } from 'vitest';
import { scale, PLOT, VIEW } from '../src/ui/components/Diagram.jsx';

/**
 * The diagram helpers are pure functions, so they are tested directly rather
 * than through a rendered figure. What is worth checking is the arithmetic:
 * a scale that maps the wrong way puts a curve upside down, which looks
 * deliberate and is wrong.
 */

describe('scale', () => {
  it('should map the domain endpoints to the range endpoints', () => {
    expect(scale(0, [0, 1], [0, 100])).toBe(0);
    expect(scale(1, [0, 1], [0, 100])).toBe(100);
  });

  it('should map the midpoint to the midpoint', () => {
    expect(scale(5, [0, 10], [0, 100])).toBe(50);
  });

  it('should invert when the range is reversed', () => {
    // This is the case that matters: SVG's y axis grows downward, so a plot
    // maps a small data value to a large y. Getting the order wrong flips the
    // curve and nothing else looks amiss.
    expect(scale(0, [0, 1], [200, 0])).toBe(200);
    expect(scale(1, [0, 1], [200, 0])).toBe(0);
    expect(scale(0.25, [0, 1], [200, 0])).toBe(150);
  });

  it('should handle a domain that does not start at zero', () => {
    expect(scale(5, [5, 10], [0, 100])).toBe(0);
    expect(scale(7.5, [5, 10], [0, 100])).toBe(50);
  });

  it('should handle a descending domain', () => {
    expect(scale(10, [10, 0], [0, 100])).toBe(0);
    expect(scale(0, [10, 0], [0, 100])).toBe(100);
  });

  it('should return the range midpoint for a degenerate domain', () => {
    // A single-valued domain has no scale to map through. Returning the middle
    // keeps the figure drawable instead of producing NaN coordinates, which
    // render as nothing at all and look like a missing feature.
    expect(scale(5, [5, 5], [0, 100])).toBe(50);
    expect(Number.isFinite(scale(5, [5, 5], [0, 100]))).toBe(true);
  });

  it('should extrapolate outside the domain rather than clamping', () => {
    // Clamping would silently hide a caller that passed a value outside the
    // range it plotted — the curve would flatten at the edge and look fine.
    expect(scale(2, [0, 1], [0, 100])).toBe(200);
    expect(scale(-1, [0, 1], [0, 100])).toBe(-100);
  });
});

describe('viewBox geometry', () => {
  it('should keep the plot area inside the viewBox', () => {
    expect(PLOT.left).toBeGreaterThan(0);
    expect(PLOT.top).toBeGreaterThan(0);
    expect(PLOT.right).toBeLessThan(VIEW.w);
    expect(PLOT.bottom).toBeLessThan(VIEW.h);
  });

  it('should leave room for the axis labels', () => {
    // The y-axis label is rotated and sits at x=14, so the plot must start
    // far enough right that the two do not overlap.
    expect(PLOT.left).toBeGreaterThanOrEqual(40);
    // The x-axis label sits below the plot, inside the viewBox.
    expect(VIEW.h - PLOT.bottom).toBeGreaterThanOrEqual(30);
  });

  it('should give the plot a positive area', () => {
    expect(PLOT.right).toBeGreaterThan(PLOT.left);
    expect(PLOT.bottom).toBeGreaterThan(PLOT.top);
  });
});
