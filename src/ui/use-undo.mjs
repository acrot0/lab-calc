import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * The undo bar.
 *
 * ## The complaint this answers
 *
 * Users reported that a mis-tap cleared the whole history. They were right to,
 * even though nothing was actually destroyed: the records were marked rather
 * than erased, and the trash section at the bottom of the panel could bring
 * any of them back. What was missing was not the recovery — it was that the
 * recovery was *invisible at the moment of the mistake*. The list went empty,
 * and the only thing on screen that could explain why was below the fold of a
 * panel the user now believed was broken.
 *
 * So the destructive actions announce themselves: for eight seconds after a
 * delete, the panel carries a bar that names what happened and offers the way
 * back. That is the whole feature. The trash section stays — it is the durable
 * undo, this is the immediate one, and they answer different questions.
 *
 * ## Why the timer is eight seconds
 *
 * Long enough to notice and read a five-word sentence, short enough that it
 * does not sit there while the user does something else. It is not a safety
 * net: the trash is. When this bar times out, nothing is lost.
 *
 * ## Why a ref rather than a state value for the timeout
 *
 * A second delete while the first bar is up must replace it, not race it. Two
 * live timers with one piece of state means the first one to fire clears a bar
 * that describes the second action.
 */

/** How long the bar stays up, in milliseconds. */
export const UNDO_MS = 8000;

/**
 * Manage the undo affordance.
 *
 * Returns the pending action and three functions. `offer` takes a description
 * of what happened and an `undo` callback; the callback is invoked at most once,
 * whether the user presses the button or does nothing and lets it expire.
 *
 * The callback is held in a ref so a re-render mid-countdown cannot swap in a
 * stale closure — the bar must undo the action that produced it, not the one a
 * subsequent render happens to see.
 */
export function useUndo() {
  const [pending, setPending] = useState(null);
  const timer = useRef(null);
  const action = useRef(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    action.current = null;
    setPending(null);
  }, []);

  /** Announce a reversible action. */
  const offer = useCallback((text, undo) => {
    if (timer.current) clearTimeout(timer.current);
    action.current = undo;
    setPending({ text });
    timer.current = setTimeout(() => {
      timer.current = null;
      action.current = null;
      setPending(null);
    }, UNDO_MS);
  }, []);

  /** Run the undo, if there is one, and dismiss the bar. */
  const run = useCallback(() => {
    const undo = action.current;
    clear();
    if (undo) undo();
  }, [clear]);

  // A timer that outlives the component would call `setPending` on an unmounted
  // tree. React warns about that, and in a panel the user can close mid-countdown
  // it is reachable.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { pending, offer, run, dismiss: clear };
}
