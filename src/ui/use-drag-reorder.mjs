import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './chart-animate.mjs';

/**
 * Drag-to-reorder, as a hook.
 *
 * ## Why the order is not committed until the drop
 *
 * The obvious implementation reorders the list on every crossing: React
 * re-renders, the DOM changes, and the elements land in their new places. It
 * works, but it puts a render on the critical path of a drag — every time the
 * finger crosses an item, on the same frames the browser is trying to keep up
 * with the pointer. Reordering is what the user is doing, so it is the worst
 * thing to make janky.
 *
 * Instead nothing reorders during the drag. Items are displaced by a
 * `transform` — a compositor-only change — and the list is reordered once, on
 * drop. A drag of any length costs exactly one render, and the frames in
 * between never touch layout or React.
 *
 * The displacement rule is the whole animation: items between the origin and
 * the pointer shift by one slot, the dragged item follows the pointer, and
 * everything else stays put. That is also what makes it correct — the visual
 * state at the moment of the drop is already the committed state, so the drop
 * is a no-op as far as the eye is concerned.
 *
 * ## Why Pointer Events
 *
 * One code path for touch, mouse and pen. Separate touch and mouse handlers
 * duplicate the geometry and drift, and they cannot work on a touch laptop
 * where both are present and the browser may deliver either.
 * `setPointerCapture` is what keeps the drag alive when the pointer leaves the
 * element — without it the first move outside the item stops the drag dead,
 * which on a five-item bar is immediately.
 *
 * ## Why the movement is throttled to a frame
 *
 * `pointermove` fires more often than the display refreshes — on a 120Hz
 * trackpad, or with a high-polling mouse, several times per frame. The handler
 * stores coordinates; a `requestAnimationFrame` callback consumes them. Doing
 * the work per event repeats it a few times per visible frame.
 *
 * ## Why there is a threshold
 *
 * A press that moves 2px is a tap with a shaky hand. Without a threshold,
 * tapping an item would pick it up instead of selecting it, and the selection
 * would be lost to a reorder nobody intended.
 *
 * ## Keyboard
 *
 * The same reorder is reachable without a pointer: Enter picks an item up, the
 * arrow keys move it one slot per press, Enter drops it, Escape puts it back
 * where it was picked up. Screen readers follow along through `aria-grabbed`
 * and a live announcement of the position. Drag is an enhancement, not the only
 * way in.
 */

/** How far the pointer must travel before a press becomes a drag, in px. */
const DRAG_THRESHOLD = 4;

/** How long a displaced item takes to slide to its new slot, in ms. */
const SHIFT_MS = 120;

/**
 * @param items      the current order (array of ids)
 * @param onReorder  called with (from, to) — the original index and the target
 */
export function useDragReorder(items, onReorder) {
  // The index the drag would drop into, so the caller can render the insertion
  // point. Null when nothing is being dragged.
  const [dragIndex, setDragIndex] = useState(null);
  const [target, setTarget] = useState(null);
  // The item the keyboard has picked up, and where it started. Separate from
  // the pointer drag because a picked-up item waits for arrow keys rather than
  // following a finger.
  const [held, setHeld] = useState(null);

  const listRef = useRef(null);
  // Refs, not state: these change on every pointer event, and re-rendering on
  // each one is exactly what this design exists to avoid.
  const gesture = useRef(null);
  const frame = useRef(0);
  const nodesRef = useRef([]);
  // Set on drop, consumed by the layout effect that runs once the reorder has
  // been applied. It is what tells that effect the transforms are describing a
  // completed drop rather than a drag still in progress.
  const pendingDrop = useRef(false);

  /** All the items in the list, in DOM order. */
  const collect = useCallback(() => {
    const list = listRef.current;
    return list ? [...list.querySelectorAll('[data-reorder-item]')] : [];
  }, []);

  /**
   * The list's axis and the size of one slot.
   *
   * Read from the first item rather than from a constant: the same hook drives
   * a vertical editor and a horizontal phone bar, and the two have different
   * geometry. Reading it from the DOM means the hook does not have to know
   * which one it is on.
   */
  const geometry = useCallback(() => {
    const list = listRef.current;
    const first = list?.querySelector('[data-reorder-item]');
    if (!list || !first) return null;
    const vertical = getComputedStyle(list).flexDirection.startsWith('column');
    const rect = first.getBoundingClientRect();
    const slot = vertical ? rect.height : rect.width;
    const lead = vertical ? list.getBoundingClientRect().top : list.getBoundingClientRect().left;
    return { vertical, slot, lead };
  }, []);

  /**
   * Displace every item for the current drag position.
   *
   * Called from the frame loop, never from the event handler. It writes only
   * `transform`, so the browser can composite the whole set without a layout
   * pass.
   */
  const paint = useCallback((g) => {
    const geo = geometry();
    if (!geo) return;
    const nodes = nodesRef.current.length ? nodesRef.current : collect();
    const { vertical, slot } = geo;

    // Which slot the dragged item would occupy: how far the pointer has
    // travelled, in slots, rounded. Rounding is what gives the swap its
    // hysteresis — the item changes slot at the halfway point of a neighbour
    // rather than flickering between two as the pointer jitters on a boundary.
    const travel = vertical ? g.y - g.startY : g.x - g.startX;
    const next = clamp(g.origin + Math.round(travel / slot), 0, items.length - 1);

    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      if (i === g.origin) {
        // The dragged item tracks the pointer exactly, unrounded, so it stays
        // under the finger. Its slot is `next`; its position is the pointer.
        // The slight enlargement is what separates it from the items sliding
        // underneath — a shadow would need a repaint, a transform does not.
        const offset = vertical ? `0, ${travel}px` : `${travel}px, 0`;
        node.style.transform = `translate3d(${offset}, 0) scale3d(1.02, 1.02, 1)`;
        continue;
      }
      // Everyone between the origin and the destination moves one slot toward
      // the origin: dragging down pushes the ones below up, and dragging up
      // pushes the ones above down. This is the shift that opens the gap.
      const between = g.origin < next
        ? i > g.origin && i <= next // dragged down
        : i >= next && i < g.origin; // dragged up
      const shift = between ? (g.origin < next ? -slot : slot) : 0;
      node.style.transform = shift
        ? (vertical ? `translate3d(0, ${shift}px, 0)` : `translate3d(${shift}px, 0, 0)`)
        : '';
    }
    return next;
  }, [collect, geometry, items.length]);

  /** Give every item its own place back, animating the return. */
  const clearShifts = useCallback((animate) => {
    const nodes = nodesRef.current;
    for (const node of nodes) {
      if (!node) continue;
      // Only items that currently carry a transform need the transition; an
      // untouched item would otherwise animate a no-op.
      const moved = node.style.transform !== '';
      node.style.transition = animate && moved ? `transform ${SHIFT_MS}ms ease` : 'none';
      node.style.transform = '';
      node.style.zIndex = '';
      node.style.willChange = '';
    }
  }, []);

  /* ---------------------------------------------------------------- drag -- */

  const onPointerDown = useCallback((index) => (e) => {
    // Only the primary button or a touch. A right-click opens a context menu
    // and a middle-click pastes on some platforms; neither is a drag.
    if (e.button != null && e.button !== 0) return;
    const geo = geometry();
    if (!geo) return;
    gesture.current = {
      origin: index,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      active: false,
      pointerId: e.pointerId,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // A synthetic pointer can refuse capture. The drag still works while the
      // pointer stays over the element.
    }
  }, [geometry]);

  const onPointerMove = useCallback((e) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    g.x = e.clientX;
    g.y = e.clientY;

    if (!g.active) {
      if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < DRAG_THRESHOLD) return;
      g.active = true;
      // Cache the nodes and lift the dragged one once, at the start of the
      // drag, rather than querying the DOM on every frame.
      nodesRef.current = collect();
      const node = nodesRef.current[g.origin];
      if (node) {
        node.style.willChange = 'transform';
        node.style.zIndex = '2';
      }
      setDragIndex(g.origin);
    }
    // The handler only records; the frame loop paints.
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        const next = paint(g);
        // Kept on the gesture, not just in state: the drop reads it, and
        // recomputing it there from a later pointer position would let the two
        // disagree by a slot if the pointer moved after the last frame.
        if (next != null) {
          g.to = next;
          setTarget(next);
        }
      });
    }
  }, [collect, paint]);

  const onPointerUp = useCallback((e) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    gesture.current = null;
    if (frame.current) {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    }
    try { e.currentTarget?.releasePointerCapture?.(e.pointerId); } catch { /* already released */ }
    if (!g.active) {
      // A press that never crossed the threshold is a tap. Nothing moved, so
      // there is nothing to commit and nothing to clean up.
      return;
    }
    /*
     * Commit, then let the layout effect settle the visuals.
     *
     * The transforms are deliberately left in place here. They describe where
     * the item *should* end up, so if the re-render lands it exactly there the
     * only thing left to do is drop the transforms — and dropping a transform
     * that is already correct is invisible. Clearing them first would show one
     * frame of the item back in its old slot before React moved it.
     */
    pendingDrop.current = true;
    if (g.to != null && g.to !== g.origin) onReorder(g.origin, g.to);
    else clearShifts(false);
    nodesRef.current = [];
    setDragIndex(null);
    setTarget(null);
  }, [clearShifts, onReorder]);

  /* ------------------------------------------------------------ keyboard -- */

  const onKeyDown = useCallback((index) => (e) => {
    const last = items.length - 1;

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (held) setHeld(null);
      // Remember where it was picked up, so Escape can put it back.
      else setHeld({ index, from: index });
      return;
    }
    if (!held) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      // Undo every move made while held by moving it back to where it started.
      if (held.index !== held.from) onReorder(held.index, held.from);
      setHeld(null);
      return;
    }

    const step = (e.key === 'ArrowUp' || e.key === 'ArrowLeft') ? -1
      : (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : 0;
    if (!step) return;
    e.preventDefault();
    const to = clamp(held.index + step, 0, last);
    if (to === held.index) return;
    // Commit each press: the item follows the keys, and the next press acts
    // from where it now is.
    onReorder(held.index, to);
    setHeld({ index: to, from: held.from });
  }, [held, items.length, onReorder]);

  /* ------------------------------------------------------------ settling -- */

  /*
   * Drop the transforms once the reorder has been applied.
   *
   * A layout effect, not a passive one: it runs before the browser paints, so
   * the frame in which React moved the items is the same frame in which the
   * transforms come off. A passive effect would let the browser paint the
   * reordered list *with* the old transforms still on it — the items would
   * appear doubled, then snap.
   *
   * The case this exists for is the drop: `pendingDrop` says the transforms
   * were left on deliberately, and the reorder they described is now the DOM
   * order, so they are exactly the ones to remove. During a drag they are the
   * live animation and must stay.
   */
  useLayoutEffect(() => {
    if (!pendingDrop.current) return;
    pendingDrop.current = false;
    clearShifts(false);
  }, [items, clearShifts]);

  /* ------------------------------------------------------------- cleanup -- */

  // A drag interrupted by unmount would leave the captured pointer and the
  // pending frame behind.
  useEffect(() => () => {
    if (frame.current) cancelAnimationFrame(frame.current);
  }, []);

  /**
   * How a caller should move an item keyboard-style, exposed so the editor does
   * not have to reimplement the semantics of "Escape restores the origin".
   */
  const heldIndex = held ? held.index : null;

  return {
    listRef,
    /** Index being dragged, or null. */
    dragIndex,
    /** Where a drag would drop, or null. */
    target,
    /** Index held by the keyboard, or null. */
    held: heldIndex,
    /** Reduced motion, so the caller can skip its own animations too. */
    reducedMotion: prefersReducedMotion(),
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onKeyDown,
    },
  };
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}