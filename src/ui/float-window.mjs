/**
 * Floating-window geometry — pure, so the arithmetic can be tested.
 *
 * The calculator is a draggable window on a desktop and a bottom sheet on a
 * phone. Both need the same two questions answered: where may the window sit,
 * and where does it end up after a drag. Neither is a DOM concern, so neither
 * lives in the component.
 *
 * ## Why clamping is not just `Math.max`
 *
 * A window dragged past the edge must stay reachable. Clamping to the viewport
 * is the obvious answer and the wrong one: it lets a user park the window
 * flush against the right edge, where the close button is a pixel from the
 * scrollbar and the window cannot be grabbed again without a precise click. So
 * the clamp keeps a *margin* of the window on screen — enough of the title bar
 * to grab, which is the only part that must always be reachable.
 *
 * The window is also allowed to go negative: a user who wants it half off the
 * left edge to read the page behind it should get that, as long as the grab
 * margin remains. Clamping to `>= 0` would fight them for no reason.
 */

/** How much of the window must remain on screen, in CSS pixels. */
export const GRAB_MARGIN = 48;

/** The gap left between the window and the viewport edge on first open. */
export const DEFAULT_INSET = 16;

/**
 * Where the window should sit the first time it opens.
 *
 * Bottom-right, clear of the navigation rail on the left and the history panel
 * on the right, which is the one region of this app that is usually empty. The
 * position is then the user's to change and is remembered.
 */
export function defaultPosition(size, viewport, inset = DEFAULT_INSET) {
  return {
    x: Math.max(inset, viewport.width - size.width - inset),
    y: Math.max(inset, viewport.height - size.height - inset),
  };
}

/**
 * Keep a position inside the viewport, preserving the grab margin.
 *
 * `min` is `GRAB_MARGIN - width`, not zero: the window may hang off the left
 * edge until only the margin is left. `max` is `viewport.width - GRAB_MARGIN`,
 * for the mirror reason.
 */
export function clampPosition(pos, size, viewport, margin = GRAB_MARGIN) {
  const minX = margin - size.width;
  const maxX = viewport.width - margin;
  const minY = 0;
  // Vertically the title bar must stay on screen, so the floor is zero and the
  // ceiling leaves the bar visible rather than the window's full height.
  const maxY = viewport.height - margin;
  return {
    x: Math.min(maxX, Math.max(minX, pos.x)),
    y: Math.min(maxY, Math.max(minY, pos.y)),
  };
}

/**
 * The position after dragging from `start` by a pointer delta.
 *
 * The delta is applied to where the window *was* when the drag began, not to
 * where it is now. Applying it to the current position accumulates rounding on
 * every pointermove, so a slow drag drifts away from the cursor — and a drag
 * that returns to its starting point does not return the window to its
 * starting place, which reads as the window slipping.
 */
export function dragTo(start, from, to) {
  return { x: start.x + (to.x - from.x), y: start.y + (to.y - from.y) };
}

/**
 * Whether the pointer is on the drag handle rather than on a control.
 *
 * The title bar contains the close button and the deg/rad toggle. Dragging
 * those would make them nearly unusable — a two-pixel movement between press
 * and release turns a click into a drag. So the handle refuses to start when
 * the press began on an interactive element.
 */
export function isDragHandle(target, handle) {
  if (!target || !handle) return false;
  if (!handle.contains(target)) return false;
  return !target.closest('button, input, select, a, [role="button"]');
}

/**
 * Whether to use the sheet layout rather than the floating window.
 *
 * A phone has no pointer to drag with, and a floating window on a small screen
 * covers the thing the user opened it to read. The sheet is anchored to the
 * bottom, where a thumb reaches, and is not draggable.
 */
export function useSheetLayout(viewport, breakpoint = 640) {
  return viewport.width < breakpoint;
}
