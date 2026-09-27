import { useEffect, useRef, useState } from 'react';

/*
 * The headline number arriving.
 *
 * ## Why it masks rather than counts up
 *
 * The obvious demo effect is a number rolling up from zero, and it is the wrong
 * one here. This is a lab calculator: the headline figure is a mass to weigh or
 * a volume to pipette, and a roll-up displays a sequence of *wrong* numbers on
 * the way to the right one. At 300ms that is a flicker nobody reads — until
 * someone screenshots mid-animation, or a screen recording is stepped through
 * frame by frame, and now there is an image of this app showing a plausible
 * value that was never the answer. A digit scramble has the same defect with
 * worse odds, because every frame looks like a real reading.
 *
 * So the digits are masked, not substituted. A masked frame cannot be mistaken
 * for a measurement because it does not contain one — it shows where the number
 * is going to be and resolves into it left to right. The showmanship survives;
 * the failure mode does not.
 *
 * ## What stays visible
 *
 * Only digits are masked. Signs, decimal points, exponents and units are drawn
 * from the first frame, so `-212.982 kJ/mol` reveals as `-···.··· kJ/mol` and
 * the reader knows the sign, the magnitude and the unit before the digits
 * arrive. Masking those too would make the panel unreadable rather than
 * suspenseful.
 */

/** How long the headline number takes to resolve. */
export const REVEAL_MS = 260;

/** What an unresolved digit is drawn as. */
const MASK = '·';

/** Whether a character is a digit this module should hide. */
function isDigit(ch) {
  return ch >= '0' && ch <= '9';
}

/**
 * Mask the digits of `text` according to `progress`.
 *
 * Returns `text` unchanged at `progress >= 1` and for any non-finite progress,
 * so the reduced-motion path and the end of the animation both produce exactly
 * the string the tab computed — not a reconstruction of it. That matters: the
 * value can be `—` for an undefined ratio or `2.055×10³` for a large constant,
 * and a function that tried to rebuild it from a number would get both wrong.
 *
 * The reveal order is left to right across the digits *only*, so the position
 * of the mask is stable even when the text has more non-digits than digits —
 * otherwise `A260/A280` would appear to reveal backwards.
 */
export function maskedValue(text, progress) {
  const s = String(text ?? '');
  if (!Number.isFinite(progress) || progress >= 1) return s;

  const positions = [];
  for (let i = 0; i < s.length; i++) if (isDigit(s[i])) positions.push(i);
  if (positions.length === 0) return s;

  const t = Math.max(0, progress);
  const shown = Math.floor(t * positions.length);
  if (shown >= positions.length) return s;

  const hidden = new Set(positions.slice(shown));
  return [...s].map((ch, i) => (hidden.has(i) ? MASK : ch)).join('');
}

/**
 * Drive a text reveal, returning the masked string to render.
 *
 * Unlike the chart driver this holds progress in state, because the thing being
 * animated is DOM text and only React can change it. That costs a render per
 * frame, which is affordable for exactly one element — the headline number —
 * and would not be for the charts, which is why they take the other route.
 *
 * `deps` restarts the reveal; it should be the value being shown, so a second
 * calculation replays rather than snapping.
 */
export function useNumberReveal(text, deps = [], {
  duration = REVEAL_MS,
  enabled = true,
} = {}) {
  /*
   * The initial progress is resolved during the first render, not in the effect.
   *
   * Starting at 1 and letting the effect set it to 0 meant the first painted
   * frame was the finished number, which then blanked to dots and resolved
   * again — a flash of the answer followed by the animation that was supposed
   * to reveal it. Lazy initialisation costs one `matchMedia` call and removes
   * the flash entirely.
   */
  const [progress, setProgress] = useState(() => (
    enabled && duration > 0 && !prefersReducedMotion() ? 0 : 1
  ));
  const latestText = useRef(text);
  latestText.current = text;

  useEffect(() => {
    // No motion, or nothing to reveal: show the finished string immediately.
    if (!enabled || duration <= 0 || prefersReducedMotion()) {
      setProgress(1);
      return undefined;
    }

    let frame = null;
    let start = null;
    setProgress(0);
    const step = (now) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / duration);
      setProgress(t);
      if (t < 1) frame = requestAnimationFrame(step);
      else setProgress(1);
    };
    frame = requestAnimationFrame(step);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, duration, enabled]);

  return maskedValue(latestText.current, progress);
}

/**
 * Whether the user has asked for no motion.
 *
 * Duplicated from `chart-animate.mjs` rather than imported, because that module
 * is about canvases and this one is about text; a shared import would make the
 * text reveal depend on the chart driver and mean either could not be removed
 * without the other. Twelve lines is cheaper than that coupling.
 */
export function prefersReducedMotion() {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  } catch {
    return false;
  }
}
