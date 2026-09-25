import { describe, it, expect, vi } from 'vitest';
import { topLayer, ownedEntries, installBackNav, LAYER_ORDER } from '../src/ui/back-nav.mjs';

/**
 * A stand-in for the browser environment.
 *
 * The module takes its window rather than reaching for the global one, so these
 * tests can assert the exact history calls without a real browser — and without
 * a fake that has to reimplement `pushState` cleverly enough to fool the code
 * under test.
 */
function fakeWin() {
  const listeners = new Map();
  const pushed = [];
  const history = {
    pushState: vi.fn((state) => pushed.push(state)),
    back: vi.fn(),
  };
  return {
    history,
    pushed,
    addEventListener: (type, fn) => { listeners.set(type, [...(listeners.get(type) ?? []), fn]); },
    removeEventListener: (type, fn) => {
      listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn));
    },
    /** Simulate the browser firing popstate with the given history state. */
    firePop: (state) => {
      for (const fn of listeners.get('popstate') ?? []) fn({ state });
    },
    listenerCount: () => (listeners.get('popstate') ?? []).length,
  };
}

describe('topLayer', () => {
  it('should return null when nothing is open', () => {
    // null is the signal to let the app exit rather than swallow the gesture.
    expect(topLayer({ notice: false, calc: false })).toBeNull();
    expect(topLayer({})).toBeNull();
    expect(topLayer(undefined)).toBeNull();
  });

  it('should return the single open layer', () => {
    expect(topLayer({ notice: false, calc: true })).toBe('calc');
    expect(topLayer({ notice: true, calc: false })).toBe('notice');
  });

  it('should prefer the modal when both are open', () => {
    // The modal renders above the drawer, so it is the one the user sees on top
    // and therefore the one a back press must close first.
    expect(topLayer({ notice: true, calc: true })).toBe('notice');
    expect(LAYER_ORDER.indexOf('notice')).toBeLessThan(LAYER_ORDER.indexOf('calc'));
  });
});

describe('ownedEntries', () => {
  it('should count one history entry per open layer', () => {
    expect(ownedEntries({})).toBe(0);
    expect(ownedEntries({ calc: true })).toBe(1);
    expect(ownedEntries({ notice: true, calc: true })).toBe(2);
  });
});

describe('installBackNav', () => {
  it('should push a history entry when a layer opens', () => {
    // Without the entry there is nothing for the back gesture to pop, and the
    // gesture closes the app instead of the layer.
    const win = fakeWin();
    const open = { calc: false };
    const { resync } = installBackNav({ win, getOpen: () => open, close: () => {} });
    expect(win.history.pushState).not.toHaveBeenCalled();

    open.calc = true;
    resync();
    expect(win.history.pushState).toHaveBeenCalledTimes(1);
    expect(win.pushed[0]).toEqual({ labCalcLayer: 1 });
  });

  it('should push once per layer when two are open', () => {
    const win = fakeWin();
    const open = { notice: true, calc: true };
    const { resync } = installBackNav({ win, getOpen: () => open, close: () => {} });
    resync();
    expect(win.history.pushState).toHaveBeenCalledTimes(2);
  });

  it('should not push again when resync sees no change', () => {
    // React re-runs effects freely; a push per run would bury the back gesture
    // under entries the user never created.
    const win = fakeWin();
    const open = { calc: true };
    const { resync } = installBackNav({ win, getOpen: () => open, close: () => {} });
    resync();
    resync();
    resync();
    expect(win.history.pushState).toHaveBeenCalledTimes(1);
  });

  it('should close the layer rather than the app on back', () => {
    const win = fakeWin();
    const open = { calc: true };
    const closed = [];
    const { resync } = installBackNav({ win, getOpen: () => open, close: (l) => closed.push(l) });
    resync();

    // The browser pops our entry, then fires popstate.
    win.firePop({ labCalcLayer: 1 });
    expect(closed).toEqual(['calc']);
  });

  it('should close the modal before the drawer', () => {
    const win = fakeWin();
    const open = { notice: true, calc: true };
    const closed = [];
    const { resync } = installBackNav({
      win, getOpen: () => open, close: (l) => { closed.push(l); open[l] = false; },
    });
    resync();

    win.firePop({ labCalcLayer: 2 });
    expect(closed).toEqual(['notice']);

    open.notice = false;
    resync();
    win.firePop({ labCalcLayer: 1 });
    expect(closed).toEqual(['notice', 'calc']);
  });

  it('should pop its own entry when a layer is closed by its button', () => {
    /*
     * The stranded-entry bug: close the drawer with its X, and the entry we
     * pushed is still on the stack. The next back press pops it, the handler
     * finds nothing open, and the app exits — one press, no visible cause.
     */
    const win = fakeWin();
    const open = { calc: true };
    const closed = [];
    const { resync } = installBackNav({ win, getOpen: () => open, close: (l) => closed.push(l) });
    resync();
    expect(win.history.pushState).toHaveBeenCalledTimes(1);

    open.calc = false;      // the X button
    resync();
    expect(win.history.back).toHaveBeenCalledTimes(1);

    // The popstate from our own back() must not be treated as a user gesture.
    win.firePop(null);
    expect(closed).toEqual([]);
  });

  it('should not swallow a back press when nothing is open', () => {
    // This is the app-exit path. Closing something here would trap the user in
    // the app with no way to leave.
    const win = fakeWin();
    const closed = [];
    installBackNav({ win, getOpen: () => ({}), close: (l) => closed.push(l) });

    win.firePop(null);
    win.firePop({});
    expect(closed).toEqual([]);
  });

  it('should not treat its own back() as a user gesture when no layer is open', () => {
    /*
     * A closed layer's self-pop can fire after the flags have already settled.
     * Counting it as a gesture would consume a real back press later and leave
     * the app stuck open.
     */
    const win = fakeWin();
    const open = { calc: true };
    const closed = [];
    const { resync } = installBackNav({ win, getOpen: () => open, close: (l) => closed.push(l) });
    resync();

    open.calc = false;
    resync();                       // selfPops -> 1
    win.firePop(null);              // our own, consumed
    expect(closed).toEqual([]);

    // A genuine press now has nothing to close, so the app may exit.
    win.firePop(null);
    expect(closed).toEqual([]);
  });

  it('should stop listening once stopped', () => {
    const win = fakeWin();
    const closed = [];
    const { resync, stop } = installBackNav({ win, getOpen: () => ({ calc: true }), close: (l) => closed.push(l) });
    resync();

    expect(win.listenerCount()).toBe(1);
    stop();
    expect(win.listenerCount()).toBe(0);

    win.firePop({ labCalcLayer: 1 });
    expect(closed).toEqual([]);
  });
});