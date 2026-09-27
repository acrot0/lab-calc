/*
 * Which way a tab switch should slide.
 *
 * ## Why direction and not just a fade
 *
 * Every tab used to fade in the same way from the same place, so a switch gave
 * no answer to "did I go forward or back". The rail is an ordered list and the
 * arrow keys walk it in order, so the position of a tab in that list is
 * information the user already has — the transition can confirm it for free by
 * coming from the side they moved toward.
 *
 * ## Why this is a separate module
 *
 * It is the one part of the transition that can be wrong in a way a screenshot
 * will not show: a sign error produces an animation that looks fine on its own
 * and reads backwards in use. Kept pure and out here so it can be tested
 * against the wraparound case, which is the one nobody checks by hand.
 */

/**
 * The direction of travel from one tab to another, as a CSS-friendly sign.
 *
 * `1` forward (the new tab is later in the order), `-1` backward, `0` for no
 * movement. The arrow-key shortcuts wrap, so the last tab to the first is
 * forward and the first to the last is backward — computed from the distance
 * the short way round rather than from the raw index difference, which would
 * make a wraparound look like a jump across the whole list.
 *
 * An unknown id on either side returns `0`: a replay can name a tab that has
 * since been renamed, and a transition that slides in from nowhere is worse
 * than one that just fades.
 */
export function tabDirection(from, to, order) {
  if (!Array.isArray(order) || order.length < 2) return 0;
  if (from === to) return 0;

  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (a < 0 || b < 0) return 0;

  /*
   * Half the list is the boundary between "forward" and "backward".
   *
   * Without it, wrapping from the last tab to the first (a distance of 1
   * forward) would be read as a distance of n-1 backward and would slide the
   * wrong way — and the wrap is the case a user hits most often, because the
   * arrow keys are how they flip through tabs.
   */
  const forward = (b - a + order.length) % order.length;
  const backward = (a - b + order.length) % order.length;
  return forward <= backward ? 1 : -1;
}
