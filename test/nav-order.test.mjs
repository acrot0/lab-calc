import { describe, it, expect } from 'vitest';
import {
  BAR_SIZE, MIN_BAR, NAV_STORAGE_KEY,
  memoryStore, resolveStore,
  reconcile, loadNav, saveNav,
  moveItem, clampBar, resolveTabs,
} from '../src/ui/nav-order.mjs';

const ALL = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

describe('reconcile', () => {
  it('should keep a saved order that names exactly the live tabs', () => {
    expect(reconcile(['c', 'a', 'b'], ['a', 'b', 'c'])).toEqual(['c', 'a', 'b']);
  });

  it('should drop ids that no longer name a tab', () => {
    // A renamed or removed tab. Keeping it would render an undefined icon.
    expect(reconcile(['gone', 'b', 'a'], ['a', 'b'])).toEqual(['b', 'a']);
  });

  it('should append tabs the saved order does not mention', () => {
    /*
     * The upgrade case: a release ships two new tabs and the stored order
     * predates them. Appending keeps the user's arrangement and puts the new
     * tabs somewhere findable, rather than losing either.
     */
    expect(reconcile(['c', 'a'], ['a', 'b', 'c', 'd'])).toEqual(['c', 'a', 'b', 'd']);
  });

  it('should ignore duplicates after the first', () => {
    // A hand-edited or corrupted store. A duplicate would render one tab twice
    // and drop another entirely, since the result must be a permutation.
    expect(reconcile(['a', 'b', 'a', 'b'], ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('should fall back to the default order when nothing is saved', () => {
    for (const saved of [null, undefined, [], 'nonsense', 42, {}]) {
      expect(reconcile(saved, ALL), String(saved)).toEqual(ALL);
    }
  });

  it('should return a permutation of the live tabs in every case', () => {
    // The invariant callers depend on: no tab missing, none invented. Without
    // it, the bar could show fewer items than it has room for.
    const cases = [[], ['z'], ['g', 'z', 'a'], ALL.slice().reverse(), ['a', 'a', 'a']];
    for (const saved of cases) {
      const out = reconcile(saved, ALL);
      expect([...out].sort(), JSON.stringify(saved)).toEqual([...ALL].sort());
    }
  });
});

describe('moveItem', () => {
  it('should move an item forward and back', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('should clamp an index past either end instead of rejecting it', () => {
    // A drag that ends past the last item means "put it last", not "cancel".
    expect(moveItem(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 99, 0)).toEqual(['c', 'a', 'b']);
  });

  it('should not mutate the input', () => {
    const order = ['a', 'b', 'c'];
    moveItem(order, 0, 2);
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('should return a copy when nothing moves', () => {
    const order = ['a', 'b', 'c'];
    const out = moveItem(order, 1, 1);
    expect(out).toEqual(order);
    expect(out).not.toBe(order);
  });

  it('should survive an empty order', () => {
    expect(moveItem([], 0, 3)).toEqual([]);
  });
});

describe('clampBar', () => {
  it('should hold the bar to the 3–5 the platforms specify', () => {
    expect(clampBar(1)).toBe(MIN_BAR);
    expect(clampBar(0)).toBe(MIN_BAR);
    expect(clampBar(9)).toBe(BAR_SIZE);
    expect(clampBar(4)).toBe(4);
  });

  it('should fall back to the minimum for a non-numeric value', () => {
    for (const bad of [null, undefined, NaN, 'four', {}]) {
      expect(clampBar(bad), String(bad)).toBe(MIN_BAR);
    }
  });
});

describe('resolveTabs', () => {
  /** Stand-in tab entries, shaped like the ones App.jsx builds. */
  const TABS = ALL.map((id) => ({ id, icon: () => null }));
  const ids = (list) => list.map((t) => t.id);

  it('should resolve the order to tab entries', () => {
    expect(ids(resolveTabs(TABS, ALL).all)).toEqual(ALL);
  });

  it('should split at the bar size', () => {
    const { bar, more } = resolveTabs(TABS, ALL);
    expect(ids(bar)).toEqual(ALL.slice(0, BAR_SIZE));
    expect(ids(more)).toEqual(ALL.slice(BAR_SIZE));
  });

  it('should respect an explicit size', () => {
    const { bar, more } = resolveTabs(TABS, ALL, 3);
    expect(ids(bar)).toEqual(['a', 'b', 'c']);
    expect(ids(more)).toEqual(['d', 'e', 'f', 'g']);
  });

  it('should clamp an out-of-range size rather than honour it', () => {
    // The M3/HIG ceiling is the point of this module; a caller passing 12 must
    // not get a twelve-item bar.
    expect(resolveTabs(TABS, ALL, 12).bar).toHaveLength(BAR_SIZE);
    expect(resolveTabs(TABS, ALL, 0).bar).toHaveLength(MIN_BAR);
  });

  it('should partition the order with nothing lost or shared', () => {
    for (let size = MIN_BAR; size <= BAR_SIZE; size += 1) {
      const { all, bar, more } = resolveTabs(TABS, ALL, size);
      expect(ids(bar).length + ids(more).length, `size ${size}`).toBe(all.length);
      expect(ids([...bar, ...more]), `size ${size}`).toEqual(ALL);
    }
  });

  it('should drop an id that no longer names a tab', () => {
    // The last boundary before a render: `tab.icon` on undefined blanks the
    // page rather than showing a shorter list.
    const { all } = resolveTabs(TABS, ['a', 'gone', 'b']);
    expect(ids(all)).toEqual(['a', 'b']);
  });

  it('should return every list empty when no order is stored', () => {
    const { all, bar, more } = resolveTabs(TABS, []);
    expect(all).toEqual([]);
    expect(bar).toEqual([]);
    expect(more).toEqual([]);
  });
});

/*
 * The platform rule, which the user's preference must not be able to break.
 *
 * Material 3 and the iOS Human Interface Guidelines both specify 3–5
 * destinations in a bottom bar. That is not a default to be overridden — it is
 * the reason the bar is usable at all, since beyond five the targets drop under
 * the 44px a thumb can hit. Every path into the size goes through `clampBar`,
 * so asserting it there covers the editor, a stored value and a hand-edited one
 * alike.
 *
 * The "no tab unreachable" half of that rule is asserted in `resolveTabs`'
 * partition test above, which is where the split actually happens.
 */
describe('the 3–5 rule', () => {
  it('should hold for every size the editor can produce', () => {
    for (let n = -5; n <= 15; n += 1) {
      const size = clampBar(n);
      expect(size, `clampBar(${n})`).toBeGreaterThanOrEqual(MIN_BAR);
      expect(size, `clampBar(${n})`).toBeLessThanOrEqual(BAR_SIZE);
    }
  });
});

describe('loadNav', () => {
  it('should return the defaults for an empty store', () => {
    const nav = loadNav(memoryStore(), ALL);
    expect(nav.order).toEqual(ALL);
    expect(nav.size).toBe(BAR_SIZE);
  });

  it('should round-trip what saveNav wrote', () => {
    const store = memoryStore();
    const order = ['g', 'f', 'e', 'd', 'c', 'b', 'a'];
    saveNav(store, { order, size: 4 });
    expect(loadNav(store, ALL)).toEqual({ order, size: 4 });
  });

  it('should reconcile the order against the live tabs on read', () => {
    const store = memoryStore({
      [NAV_STORAGE_KEY]: JSON.stringify({ order: ['g', 'gone', 'a'], size: 4 }),
    });
    expect(loadNav(store, ALL).order).toEqual(['g', 'a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('should clamp a stored size that is outside the range', () => {
    const store = memoryStore({ [NAV_STORAGE_KEY]: JSON.stringify({ order: ALL, size: 20 }) });
    expect(loadNav(store, ALL).size).toBe(BAR_SIZE);
  });

  it('should survive a corrupt stored value', () => {
    /*
     * A truncated write, a value from a different app on the same origin, a
     * user editing devtools. Reading it must not throw — this runs inside the
     * first render, so a throw is a blank screen.
     */
    for (const raw of ['{', 'null', '[]', '"str"', '{"order":"x","size":"y"}']) {
      const store = memoryStore({ [NAV_STORAGE_KEY]: raw });
      expect(() => loadNav(store, ALL), raw).not.toThrow();
      expect(loadNav(store, ALL).order, raw).toEqual(ALL);
    }
  });

  it('should survive a store that throws on read', () => {
    const hostile = { getItem: () => { throw new Error('blocked'); }, setItem: () => {}, removeItem: () => {} };
    expect(loadNav(hostile, ALL).order).toEqual(ALL);
  });
});

describe('saveNav', () => {
  it('should survive a store that throws on write', () => {
    // Quota exceeded. The order is cosmetic; the interaction that triggered the
    // save must not fail over it.
    const hostile = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
    expect(() => saveNav(hostile, { order: ALL, size: 4 })).not.toThrow();
  });

  it('should write a clamped size', () => {
    const store = memoryStore();
    saveNav(store, { order: ALL, size: 99 });
    expect(JSON.parse(store.getItem(NAV_STORAGE_KEY)).size).toBe(BAR_SIZE);
  });
});

describe('resolveStore', () => {
  it('should hand back a working store', () => {
    const store = memoryStore({ seed: '1' });
    expect(resolveStore(store)).toBe(store);
  });

  it('should fall back to memory when the candidate throws', () => {
    const hostile = {
      getItem: () => null,
      setItem: () => { throw new Error('private mode'); },
      removeItem: () => {},
    };
    const store = resolveStore(hostile);
    expect(() => store.setItem('k', 'v')).not.toThrow();
    expect(store.getItem('k')).toBe('v');
  });
});