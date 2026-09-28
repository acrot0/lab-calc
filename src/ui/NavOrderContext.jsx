import React, {
  createContext, useCallback, useContext, useMemo, useState,
} from 'react';
import {
  BAR_SIZE, barTabs, clampBar, clearNav, loadNav, moveItem, saveNav, resolveStore,
} from './nav-order.mjs';

const Ctx = createContext(null);

/**
 * The user's tab order, and the actions that change it.
 *
 * ## Why a context and not state in `App`
 *
 * Two navigations render this order — the phone's bottom bar and the desktop
 * rail — plus the editor that changes it. Threading the order and its setters
 * through all three as props would put four more parameters on components that
 * do not otherwise care about each other. The order is one value with one
 * owner, which is what a context is for.
 *
 * ## Why it initialises lazily
 *
 * `loadNav` reads localStorage, which throws in Safari private mode. Reading it
 * during the first render would put that throw inside render, and there is no
 * error boundary above this. The lazy initialiser keeps the throwing read
 * inside a try/catch in `nav-order.mjs`, and the state it produces is
 * reconciled against the live tabs — so a tab added by an update appears even
 * when the stored order predates it.
 *
 * ## Why writes are not effects
 *
 * Saving on every render would also save on the first one, overwriting the
 * user's stored order with the default before it had been read back. The
 * setters below persist explicitly, when the user has actually changed
 * something.
 */
export function NavOrderProvider({ allIds, children, store: storeProp }) {
  // Resolved once. A store that throws on write is replaced by a memory store,
  // so the preference still works within the session even where it cannot
  // persist — a user in private mode should still be able to reorder.
  const store = useMemo(() => resolveStore(storeProp), [storeProp]);

  const [state, setState] = useState(() => loadNav(store, allIds));
  const { order, size } = state;

  /** Commit a new order, persisting it. */
  const setOrder = useCallback((next) => {
    setState((prev) => {
      const updated = { order: next, size: prev.size };
      saveNav(store, updated);
      return updated;
    });
  }, [store]);

  /** Move one tab, persisting the result. */
  const move = useCallback((from, to) => {
    setState((prev) => {
      const updated = { order: moveItem(prev.order, from, to), size: prev.size };
      saveNav(store, updated);
      return updated;
    });
  }, [store]);

  /** Change how many tabs the bar holds. Clamped to the 3–5 the platforms allow. */
  const setSize = useCallback((n) => {
    setState((prev) => {
      const updated = { order: prev.order, size: clampBar(n) };
      saveNav(store, updated);
      return updated;
    });
  }, [store]);

  /** Drop the stored preference and fall back to the app's own order. */
  const reset = useCallback(() => {
    setState(() => {
      clearNav(store);
      // Read back rather than constructing: `loadNav` on an empty store is the
      // one definition of "the default", so the reset cannot drift from it.
      return loadNav(store, allIds);
    });
  }, [store, allIds]);

  const value = useMemo(() => ({
    order,
    size,
    bar: barTabs(order, size),
    more: order.slice(size),
    setOrder,
    move,
    setSize,
    reset,
  }), [order, size, setOrder, move, setSize, reset]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNavOrder() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNavOrder must be used inside a NavOrderProvider');
  return v;
}

export { BAR_SIZE };