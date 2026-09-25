/**
 * Android / iOS back-gesture handling.
 *
 * ## The problem
 *
 * An installed PWA runs without browser chrome, so there is no back button on
 * screen — the only back is the system gesture or the hardware key. With no
 * history entries of our own, that gesture closes the app. So a user who opens
 * the floating calculator, presses back expecting the calculator to close, and
 * instead loses the whole app along with whatever was typed into the form.
 *
 * ## The fix
 *
 * Push one history entry per dismissible layer while it is open. The back
 * gesture then pops that entry, which fires `popstate`, and we close the layer
 * instead of the app. The entry is popped by the browser before we hear about
 * it, so closing must NOT push again — hence the `closing` guard below, or the
 * two would fight and the app would never exit.
 *
 * ## Why this is a module and not a hook
 *
 * The decision — "is there a layer to close, and which one" — is pure and is
 * where the bugs live. It is separable from React, so it can be tested without
 * mounting anything. The hook that wires it up is a thin adapter.
 */

/**
 * The dismissible layers, in the order they should close.
 *
 * Ordered innermost-first: the modal sits above the drawer, so a back press
 * while both are open closes the modal, and a second press closes the drawer.
 * A single press closing both would make a two-step stack feel like one.
 */
export const LAYER_ORDER = ['notice', 'calc'];

/**
 * Which layer a back press should close, or `null` if the app should exit.
 *
 * @param {{ notice?: boolean, calc?: boolean }} open
 * @returns {string|null}
 */
export function topLayer(open) {
  for (const layer of LAYER_ORDER) {
    if (open?.[layer]) return layer;
  }
  return null;
}

/**
 * How many history entries we currently own.
 *
 * One per open layer. Kept as a function rather than a count so the caller does
 * not have to keep a second piece of state in step with the first — the open
 * flags are the single source of truth.
 */
export function ownedEntries(open) {
  return LAYER_ORDER.filter((layer) => open?.[layer]).length;
}

/**
 * Wire back-gesture handling to a set of layers.
 *
 * Deliberately takes its environment rather than reaching for `globalThis`, so
 * a test can drive it with a fake window and assert the exact calls. The real
 * caller passes the browser's.
 *
 * @param {object} opts
 * @param {object} opts.win           Window-like: addEventListener/removeEventListener/history/location
 * @param {() => object} opts.getOpen Current open flags, read at event time
 * @param {(layer: string) => void} opts.close  Close one named layer
 * @returns {{ stop: () => void, resync: () => void }}
 *   `stop` unsubscribes. `resync` must be called whenever the open flags
 *   change — it is what pushes the entry for a newly opened layer, and the
 *   caller is the only one who knows that happened.
 */
export function installBackNav({ win, getOpen, close }) {
  const target = win ?? globalThis;

  /*
   * Tracks entries we pushed and have not yet consumed.
   *
   * Without this the handler cannot tell our own popstate from a user pressing
   * back on a layer that is already closed — and it would call `close` on
   * nothing, or worse, re-push. A counter rather than a boolean because two
   * layers can be open at once.
   */
  let owned = 0;

  /*
   * Counts our own `history.back()` calls.
   *
   * A layer dismissed by its own button (the X, Escape, clicking the scrim)
   * leaves the entry we pushed sitting on the stack. Left there, the next back
   * press pops *that* entry and the handler sees no open layer, so the app
   * exits — the user presses back once and loses the app for no visible reason.
   * So a programmatic close pops its own entry, and the popstate that results
   * is ours to ignore rather than a user gesture to act on.
   */
  let selfPops = 0;

  // Keep the pushed entries in step with the open flags.
  const sync = () => {
    const want = ownedEntries(getOpen());
    if (want > owned) {
      for (let i = owned; i < want; i++) target.history.pushState({ labCalcLayer: i + 1 }, '');
      owned = want;
    } else if (want < owned) {
      const drop = owned - want;
      owned = want;
      // One `back()` per stranded entry walks the stack back to where we were.
      for (let i = 0; i < drop; i++) {
        selfPops++;
        target.history.back();
      }
    }
  };

  const onPop = (event) => {
    if (selfPops > 0) { selfPops--; return; }

    /*
     * A popstate with no state of ours is the user navigating away from the
     * app entirely (or arriving from outside). Closing a layer here would eat
     * their exit, so it is left alone.
     */
    if (owned === 0 && !event?.state) return;

    const layer = topLayer(getOpen());
    if (!layer) return;          // nothing to close: let the app exit

    if (owned > 0) owned--;
    close(layer);
    // The caller's effect runs `resync` on the resulting state change, which
    // pushes again if another layer is still open.
  };

  target.addEventListener('popstate', onPop);

  return {
    resync: sync,
    stop: () => { target.removeEventListener('popstate', onPop); },
  };
}