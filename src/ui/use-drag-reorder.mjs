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
   * The list's axis, and the pitch between two rows.
   *
   * Read from the DOM rather than from a constant: the same hook drives a
   * vertical editor and a horizontal phone bar, and the two have different
   * geometry.
   *
   * ## Why `offsetTop`, not `getBoundingClientRect`
   *
   * The pitch is measured while rows are displaced by `transform`, and
   * `getBoundingClientRect` reports the *transformed* position. Measuring the
   * gap that way meant the pitch changed as the drag moved: at rest the two
   * rows are 52px apart, but mid-drag the dragged row had been translated, so
   * the difference between its rect and the next row's was a different number
   * every frame. The slot then disagreed with itself between the frame that
   * chose the target and the frame that painted it, and rows landed on top of
   * each other.
   *
   * `offsetTop` is the layout position, before transforms, so the pitch is the
   * same number on every frame of a drag as it is at rest.
   *
   * ## Why the second row
   *
   * The pitch is the row plus the gap between rows, and only a measurement
   * between two rows includes the gap. Using the row height alone was the other
   * half of the overlap: at 48px rows with a 4px gap, a drag of 1.5 slots moved
   * the dragged row by the raw 78px while its neighbours moved by 2 × 48px.
   *
   * `offsetHeight` for the single-row case, where there is no second row to
   * measure against and the row's own size is the best available answer.
   */
  const geometry = useCallback(() => {
    const list = listRef.current;
    const items = list ? [...list.querySelectorAll('[data-reorder-item]')] : [];
    if (!list || items.length === 0) return null;
    const vertical = getComputedStyle(list).flexDirection.startsWith('column');
    const first = items[0];
    const second = items[1];
    const slot = second
      ? (vertical ? second.offsetTop - first.offsetTop : second.offsetLeft - first.offsetLeft)
      : (vertical ? first.offsetHeight : first.offsetWidth);
    return { vertical, slot };
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

    /*
     * How far the pointer has travelled, and which slot that lands on.
     *
     * `Math.round` is the hysteresis: the item changes slot at the halfway
     * point of a neighbour rather than flickering between two as the pointer
     * jitters on a boundary.
     */
    const travel = vertical ? g.y - g.startY : g.x - g.startX;
    const slots = Math.round(travel / slot);
    const next = clamp(g.origin + slots, 0, items.length - 1);

    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      if (i === g.origin) {
        /*
         * The dragged row follows the pointer exactly — not its snapped slot.
         *
         * It has to be the raw travel, because the rows it displaces move in
         * whole slots and the two have to agree about where the slots are. An
         * earlier version displaced this row by `snapped + (travel - snapped)`,
         * which is algebraically the same number written as if it were doing
         * something clever; it is not, and the arithmetic only obscured that
         * the row tracks the finger.
         *
         * Translated only — no scale. It used to carry `scale3d(1.02, …)` to
         * lift it off the rows underneath, and that was half of the overlap
         * that made rows pile up: a 48px row at 1.02 is 49px, so it grew 3px
         * past its own bounds at each end and covered the row below by 6px.
         * Measured with the pointer 10px into a drag — before any neighbour had
         * moved — the dragged row's bottom was 389 and the next row's top was
         * 383.
         *
         * The separation is the background and shadow on `.is-dragging`, which
         * cost nothing and do not change the row's size.
         */
        /*
         * Three components, written out — not a pre-joined `"0, 80px"` string
         * spliced into the middle of a four-argument template.
         *
         * That splice is what broke this: `translate3d` takes exactly three
         * lengths, and the joined form produced `translate3d(0, 80px, 0, 0)`.
         * An invalid value is not an error — the browser silently drops the
         * declaration, `style.transform` reads back empty, and the dragged row
         * never moves while the rows around it do. The row under the finger
         * stays put and its neighbour slides into the same place, which is the
         * overlap.
         *
         * Spelled out, a miscount is visible in the source. `translate3d` is
         * used rather than `translate` because the drag runs on the compositor
         * and a 2D transform can be rasterised on a low-end device.
         */
        node.style.transform = vertical
          ? `translate3d(0, ${travel}px, 0)`
          : `translate3d(${travel}px, 0, 0)`;
        continue;
      }
      // Everyone between the origin and the destination moves one slot toward
      // the origin: dragging down pushes the ones below up, and dragging up
      // pushes the ones above down. This is the shift that opens the gap.
      const between = g.origin < next
        ? i > g.origin && i <= next // dragged down
        : i >= next && i < g.origin; // dragged up
      const shift = between ? (g.origin < next ? -slot : slot) : 0;
      // Three components spelled out, for the same reason as the dragged row's.
      if (!shift) node.style.transform = '';
      else if (vertical) node.style.transform = `translate3d(0, ${shift}px, 0)`;
      else node.style.transform = `translate3d(${shift}px, 0, 0)`;
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
     *
     * `nodesRef` is *not* cleared here. It holds the only references to the
     * displaced rows, and the layout effect needs them to take the transforms
     * off — clearing it first left every neighbour permanently offset by one
     * slot, which is what made a dropped drag leave the list visibly wrong.
     * The effect clears it once it has finished with it.
     */
    pendingDrop.current = true;
    if (g.to != null && g.to !== g.origin) onReorder(g.origin, g.to);
    else {
      clearShifts(false);
      nodesRef.current = [];
    }
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
    // Only now: these are the references `clearShifts` just used, and the
    // gesture that produced them is over.
    nodesRef.current = [];
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

    /*
     * The list's own handlers: movement and release only.
     *
     * These are spread onto the list element, so they take the event directly.
     * The two that need to know *which row* are factories instead — see
     * `rowHandlers` — and mixing the two kinds in one object was a real bug:
     * `<ul {...handlers}>` passed the factory itself as the listener, React
     * called it with the event, and `index` became a PointerEvent. `origin` was
     * then an object that matched no row, so the dragged row was never
     * transformed while its neighbours were — the rows piled up on each other.
     */
    listHandlers: {
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },

    /**
     * The per-row handlers, as factories.
     *
     * `dragHandle(i)` goes on row `i`'s grip — the only element a pointer drag
     * may start from, which is what lets the row itself keep its
     * `touch-action: auto` and the list stay scrollable. `keyHandler(i)` goes on
     * the same grip for the keyboard reorder.
     */
    dragHandle: onPointerDown,
    keyHandler: onKeyDown,
  };
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}