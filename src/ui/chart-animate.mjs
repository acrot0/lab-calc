import { useEffect, useRef } from 'react';

/*
 * Charts that draw themselves.
 *
 * ## Why a shared driver rather than seven copies
 *
 * Seven canvases in this app draw a curve: the titration curve, the speciation
 * distribution, the kinetics plot, the yield curve, the phase diagram, the
 * Nernst line and the two spectrophotometry plots. Each had its own
 * `useEffect` that painted the finished picture in a single frame. Adding a
 * reveal to each would have meant seven animation loops, seven reduced-motion
 * checks and seven chances to get the frame timing wrong.
 *
 * So the loop lives here and the charts learn one thing: how much of
 * themselves to draw. `visibleCount` is the whole of that contract — a chart
 * slices its point list to that length and draws a line through what it has.
 *
 * ## Why it does not hold the progress in state
 *
 * The obvious shape — `useState` for the progress, re-render, chart redraws —
 * costs a React render on every animation frame, twenty-odd renders per chart
 * per reveal, to move a number the component does not display. The draw
 * function is called directly instead, so the reveal never touches React.
 *
 * ## Why it is a hook and not CSS
 *
 * These are canvas draws, not DOM elements, so there is no element for a
 * transition to act on. The standard trick — render the curve as SVG and
 * animate `stroke-dashoffset` — would mean rewriting seven chart components
 * that are each a few hundred lines of canvas code. The loop is the smaller
 * change, and it leaves the charts able to animate things a dash offset cannot
 * (a marker arriving at the end, a band fading in behind the line).
 */

/**
 * How much of a curve to draw at a given progress.
 *
 * Returns an integer in `1..n` for any progress above zero, and `n` at or past
 * the end. The floor at 1 is deliberate: a line through a single point is
 * invisible, so a chart that drew `floor(0.02 * 40) = 0` points on its second
 * frame would flicker between blank and visible. Starting at one point and
 * growing from there never shows an empty frame after the first.
 *
 * `progress >= 1` short-circuits to `n` rather than trusting the arithmetic,
 * because that is also the path taken when motion is off — the reduced-motion
 * case must produce exactly the finished picture, not an approximation of it.
 */
export function visibleCount(progress, n) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (!Number.isFinite(progress) || progress >= 1) return n;
  if (progress <= 0) return 1;
  return Math.min(n, Math.max(1, Math.ceil(progress * n)));
}

/**
 * Cubic ease-out, the shape of `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`.
 *
 * A canvas cannot read a CSS custom property, so the curve is transcribed.
 * It is an approximation of that bézier rather than the same curve — but it
 * decelerates into place the same way, which is the whole requirement: a chart
 * should arrive like the card it sits in, not like a linear wipe.
 */
export function easeOut(t) {
  if (!Number.isFinite(t)) return 1;
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

/** How long a chart takes to draw itself. Inside the 350ms `--dur-move-s`. */
export const DRAW_MS = 320;

/**
 * Size a canvas for the device pixel ratio and return its 2D context.
 *
 * Both assignments are guarded, and that guard is the whole point: assigning
 * `canvas.width` clears the bitmap and resets the transform *even when the
 * value is unchanged*. A chart whose draw function now runs once per animation
 * frame would wipe itself on every frame and end up showing only the last
 * sliver of the curve. Sizing is a mount-time concern that happens to live in
 * the draw function, so it has to be idempotent.
 *
 * Returns `null` when there is no context — jsdom without the test stub, or a
 * browser that refused one. Callers return early; drawing into a missing
 * context throws and takes the whole tab down with it.
 */
export function sizeCanvas(canvas, width, height) {
  const dpr = globalThis.devicePixelRatio || 1;
  const w = Math.round(width * dpr);
  const h = Math.round(height * dpr);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const cssW = `${width}px`;
  const cssH = `${height}px`;
  if (canvas.style.width !== cssW) canvas.style.width = cssW;
  if (canvas.style.height !== cssH) canvas.style.height = cssH;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/**
 * Whether the user has asked for no motion.
 *
 * Read at call time rather than cached, because the setting can change without
 * a reload. Guarded for environments without `matchMedia` — jsdom does not
 * implement it, and every chart test would fail on the absence rather than on
 * the drawing.
 */
export function prefersReducedMotion() {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  } catch {
    return false;
  }
}

/**
 * Drive a draw function from 0 to 1.
 *
 * `draw` is called with the progress and must do a full repaint — it is called
 * on every frame, so it cannot append to the previous one. `deps` restarts the
 * animation; it should list the inputs that change the picture, so a new input
 * or a theme switch replays the reveal instead of jumping.
 *
 * `enabled` lets a chart that is off-screen or not yet expanded skip the loop
 * entirely and paint once.
 */
export function useChartDraw(draw, deps = [], {
  duration = DRAW_MS,
  enabled = true,
} = {}) {
  const latest = useRef(draw);
  latest.current = draw;

  useEffect(() => {
    /*
     * No motion: paint the finished picture once and never animate.
     *
     * `prefersReducedMotion` is read inside the effect rather than listed as a
     * dependency, so a user changing the setting mid-session gets the animation
     * back on the next redraw without the chart remounting.
     */
    if (!enabled || duration <= 0 || prefersReducedMotion()) {
      latest.current(1);
      return undefined;
    }

    /*
     * Frame zero is painted synchronously, before the first animation frame is
     * requested.
     *
     * Without this the canvas holds nothing at all until the browser gets
     * around to its next frame, which is usually invisible and occasionally is
     * not: a chart mounted into a background tab can sit blank until the tab is
     * focused, and anything that inspects the canvas before then sees an empty
     * bitmap. Drawing the grid and the first point immediately means the canvas
     * is never in that state.
     */
    latest.current(0);

    let frame = null;
    let start = null;
    const step = (now) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / duration);
      latest.current(easeOut(t));
      // One frame past the end, with progress pinned to exactly 1, so the last
      // thing drawn is the mathematically complete picture rather than
      // whatever the final interpolated frame happened to land on.
      if (t < 1) frame = requestAnimationFrame(step);
      else latest.current(1);
    };
    frame = requestAnimationFrame(step);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, duration, enabled]);
}
