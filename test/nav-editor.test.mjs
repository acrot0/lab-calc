// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../src/ui/LocaleContext.jsx';
import { NavOrderProvider } from '../src/ui/NavOrderContext.jsx';
import NavEditor from '../src/ui/components/NavEditor.jsx';
import { dragTarget, rowShift } from '../src/ui/use-drag-reorder.mjs';
import { NAV_STORAGE_KEY, memoryStore } from '../src/ui/nav-order.mjs';
import { readFileSync } from 'node:fs';

/*
 * The navigation editor, mounted.
 *
 * The pure half is covered in `nav-order.test.mjs`. What is only testable here
 * is the wiring: that the editor renders one row per tab in the stored order,
 * that a keyboard reorder reaches the store, and that the reset clears it. The
 * drag itself is pointer-driven and is verified in a browser — jsdom has no
 * layout, so every `getBoundingClientRect` returns zeros and a synthesised drag
 * would be testing the mock.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const TABS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ id, icon: () => null }));
const ALL_IDS = TABS.map((t) => t.id);

let store;
let mounted;

beforeEach(() => { store = memoryStore(); });

afterEach(async () => {
  if (mounted) { await mounted.unmount(); mounted = null; }
});

async function mountEditor(props = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  /*
   * Wrapped in `StrictMode`, as `main.jsx` does.
   *
   * StrictMode calls a `setState` updater twice to surface a side effect inside
   * one, and the provider writes to storage on every change — so the doubled
   * call is the thing to keep honest. Mounting without it would test a shape
   * the app never runs in.
   */
  await act(async () => {
    root.render(
      React.createElement(React.StrictMode, null,
        React.createElement(LocaleProvider, { store },
          React.createElement(NavOrderProvider, { allIds: ALL_IDS, store },
            React.createElement(NavEditor, { tabs: TABS, onClose: props.onClose ?? (() => {}) })))),
    );
  });
  mounted = {
    container,
    unmount: async () => { await act(async () => { root.unmount(); }); container.remove(); },
  };
  return container;
}

/** The tab ids the editor is showing, in order. */
const shown = (c) => [...c.querySelectorAll('.nav-editor-item')].map((li) => li.dataset.id);

/** Fire a keydown on the grip of row `i`. */
async function key(c, i, k) {
  const grip = c.querySelectorAll('.nav-editor-grip')[i];
  await act(async () => {
    grip.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  });
}

describe('the navigation editor', () => {
  it('should render one row per tab, in the stored order', async () => {
    const c = await mountEditor();
    expect(shown(c)).toEqual(ALL_IDS);
  });

  it('should mark the bar rows and draw the boundary once', async () => {
    const c = await mountEditor();
    expect(c.querySelectorAll('.nav-editor-item.is-in-bar')).toHaveLength(5);
    // One boundary rule, at the first row outside the bar. Two would mean the
    // rule is anchored to something other than the size.
    expect(c.querySelectorAll('.nav-editor-item.is-boundary')).toHaveLength(1);
  });

  it('should follow a stored order rather than the default one', async () => {
    store.setItem(NAV_STORAGE_KEY, JSON.stringify({ order: [...ALL_IDS].reverse(), size: 4 }));
    const c = await mountEditor();
    expect(shown(c)).toEqual([...ALL_IDS].reverse());
    expect(c.querySelectorAll('.nav-editor-item.is-in-bar')).toHaveLength(4);
  });

  it('should pick an item up with Enter and drop it with Enter', async () => {
    const c = await mountEditor();
    await key(c, 0, 'Enter');
    expect(c.querySelectorAll('.nav-editor-item.is-held')).toHaveLength(1);
    await key(c, 0, 'Enter');
    expect(c.querySelectorAll('.nav-editor-item.is-held')).toHaveLength(0);
  });

  it('should move a held item with the arrow keys and persist the result', async () => {
    const c = await mountEditor();
    await key(c, 0, 'Enter');
    await key(c, 0, 'ArrowDown');
    expect(shown(c)).toEqual(['b', 'a', 'c', 'd', 'e', 'f', 'g']);
    // Persisted, not just rendered: the order survives a reload.
    expect(JSON.parse(store.getItem(NAV_STORAGE_KEY)).order)
      .toEqual(['b', 'a', 'c', 'd', 'e', 'f', 'g']);
  });

  it('should follow the held item as it moves', async () => {
    // After a move the item lives at the new index, so the next arrow press has
    // to act from there. Reading a stale index would move it back and forth.
    const c = await mountEditor();
    await key(c, 0, 'Enter');
    await key(c, 0, 'ArrowDown');
    await key(c, 1, 'ArrowDown');
    expect(shown(c)).toEqual(['b', 'c', 'a', 'd', 'e', 'f', 'g']);
  });

  it('should put a held item back where it was picked up on Escape', async () => {
    const c = await mountEditor();
    await key(c, 0, 'Enter');
    await key(c, 0, 'ArrowDown');
    await key(c, 1, 'ArrowDown');
    expect(shown(c)[0]).toBe('b');
    await key(c, 2, 'Escape');
    expect(shown(c)).toEqual(ALL_IDS);
    expect(c.querySelectorAll('.nav-editor-item.is-held')).toHaveLength(0);
  });

  it('should not move anything when an arrow is pressed with nothing held', async () => {
    const c = await mountEditor();
    await key(c, 0, 'ArrowDown');
    expect(shown(c)).toEqual(ALL_IDS);
  });

  it('should stop a held item at the ends rather than wrapping', async () => {
    const c = await mountEditor();
    await key(c, 0, 'Enter');
    await key(c, 0, 'ArrowUp');
    expect(shown(c)[0]).toBe('a');
    await key(c, 0, 'Escape');
  });

  it('should change the bar size and persist it', async () => {
    const c = await mountEditor();
    const [minus, plus] = c.querySelectorAll('.nav-editor-stepper .icon-btn');
    await act(async () => { minus.click(); });
    expect(c.querySelectorAll('.nav-editor-item.is-in-bar')).toHaveLength(4);
    await act(async () => { plus.click(); });
    await act(async () => { plus.click(); });
    expect(JSON.parse(store.getItem(NAV_STORAGE_KEY)).size).toBe(5);
  });

  it('should refuse to take the bar below three', async () => {
    // The platform floor. A disabled button is the honest way to say so — a
    // control that silently clamps is one the user thinks is broken.
    const c = await mountEditor();
    const [minus] = c.querySelectorAll('.nav-editor-stepper .icon-btn');
    await act(async () => { minus.click(); });
    await act(async () => { minus.click(); });
    expect(minus.disabled).toBe(true);
    await act(async () => { minus.click(); });
    expect(c.querySelectorAll('.nav-editor-item.is-in-bar')).toHaveLength(3);
  });

  it('should reset to the default order and clear the stored preference', async () => {
    store.setItem(NAV_STORAGE_KEY, JSON.stringify({ order: [...ALL_IDS].reverse(), size: 3 }));
    const c = await mountEditor();
    await act(async () => { c.querySelector('.nav-editor-actions .link-btn').click(); });
    expect(shown(c)).toEqual(ALL_IDS);
    expect(c.querySelectorAll('.nav-editor-item.is-in-bar')).toHaveLength(5);
    expect(store.getItem(NAV_STORAGE_KEY)).toBeNull();
  });

  it('should write the preference once per change, not once per render pass', async () => {
    /*
     * The provider persists on every change. Doing that from inside a
     * `setState` updater would run the write twice under StrictMode — React
     * calls an updater twice by design, to surface exactly that — and React
     * logs a purity warning. The write belongs beside the state change, not
     * inside it.
     */
    let writes = 0;
    const counting = {
      getItem: (k) => store.getItem(k),
      removeItem: (k) => store.removeItem(k),
      setItem: (k, v) => { writes += 1; store.setItem(k, v); },
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(React.StrictMode, null,
          React.createElement(LocaleProvider, { store: counting },
            React.createElement(NavOrderProvider, { allIds: ALL_IDS, store: counting },
              React.createElement(NavEditor, { tabs: TABS, onClose: () => {} })))),
      );
    });
    const before = writes;
    await act(async () => {
      container.querySelectorAll('.nav-editor-stepper .icon-btn')[0].click();
    });
    expect(writes - before, 'one size change should write once').toBe(1);
    await act(async () => { root.unmount(); });
    container.remove();
  });

  it('should announce the position of a held item', async () => {
    const c = await mountEditor();
    await key(c, 0, 'Enter');
    await key(c, 0, 'ArrowDown');
    const live = c.querySelector('[role="status"]');
    expect(live).not.toBeNull();
    // The tab's own name and its position, so every move produces a new
    // sentence — a live region whose text does not change is not announced.
    expect(live.textContent).toContain('2');
  });

  it('should close on Escape only when nothing is held', async () => {
    // Otherwise the same key would both put the item back and close the editor,
    // and the user would lose the panel they were working in.
    let closed = 0;
    const c = await mountEditor({ onClose: () => { closed += 1; } });
    await key(c, 0, 'Enter');
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(closed, 'Escape while holding').toBe(0);
    await key(c, 0, 'Escape');
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(closed, 'Escape with nothing held').toBe(1);
  });
});

/*
 * Where `touch-action` is declared, read out of the stylesheet.
 *
 * A touch that starts on an element resolves `touch-action` against that
 * element, not against its scrollable ancestor. The editor's rows filled the
 * list — 48px rows with a 4px gap — so putting `none` on the row meant a finger
 * landing on a row could not scroll the list at all; only the 4px gaps between
 * rows could. On a phone that is a list that will not scroll.
 *
 * The declaration is only needed where the drag starts, which is the grip: that
 * is the only element `onPointerDown` is bound to. On the row it is both
 * unnecessary and harmful.
 */
describe('the editor’s touch-action', () => {
  const css = readFileSync('src/ui/styles.css', 'utf8');

  /** The declarations of a rule, comments stripped. */
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(
      css.replace(/\/\*[\s\S]*?\*\//g, ''),
    );
    return m ? m[1] : null;
  };

  it('should not stop the list scrolling from a touch that lands on a row', () => {
    const body = rule('.nav-editor-item');
    expect(body, '.nav-editor-item rule not found').not.toBeNull();
    expect(body, 'touch-action on the row blocks scrolling the list')
      .not.toMatch(/touch-action:\s*none/);
  });

  it('should keep touch-action on the grip, which is where a drag starts', () => {
    // Without it the browser claims the gesture for scrolling and the drag
    // never receives a move event.
    const body = rule('.nav-editor-grip');
    expect(body, '.nav-editor-grip rule not found').not.toBeNull();
    expect(body).toMatch(/touch-action:\s*none/);
  });

  it('should bind the drag to the grip and not to the row', () => {
    // The pairing the rule above depends on. If a drag could start on the row,
    // the row would need `touch-action: none` back and the list would stop
    // scrolling again.
    const src = readFileSync('src/ui/components/NavEditor.jsx', 'utf8');
    const grip = src.slice(src.indexOf('nav-editor-grip'), src.indexOf('nav-editor-grip') + 400);
    expect(grip, 'the grip should start the drag').toMatch(/onPointerDown=\{dragHandle\(i\)\}/);
    const li = src.slice(src.indexOf('data-reorder-item'), src.indexOf('data-reorder-item') + 900);
    expect(li, 'the row should not start a drag').not.toMatch(/onPointerDown=/);
  });

  it('should not pass a row factory to the list element', () => {
    /*
     * The bug that made rows pile up on each other: `handlers` held both the
     * list's own listeners and the per-row factories, and `<ul {...handlers}>`
     * spread the factory itself as `onPointerDown`. React called it with the
     * event, so `index` became a PointerEvent, `origin` matched no row, and the
     * dragged row was never transformed while its neighbours were.
     *
     * The two kinds are now separate names, and this asserts the split holds.
     */
    const editor = readFileSync('src/ui/components/NavEditor.jsx', 'utf8');
    expect(editor).toMatch(/<ul[^>]*\{\.\.\.listHandlers\}/);
    expect(editor, 'the list must not receive the row factories').not.toMatch(/<ul[^>]*\{\.\.\.handlers\}/);
  });
});

/*
 * The drag's geometry.
 *
 * jsdom has no layout, so a synthesised drag here would be testing the mock —
 * the browser check for this lives in the commit message. What *is* testable
 * without layout is the two rules the overlap violated.
 */
describe('the drag slot', () => {
  const src = readFileSync('src/ui/use-drag-reorder.mjs', 'utf8');

  it('should measure the pitch from layout, not from the rendered rect', () => {
    /*
     * The pitch is the row plus the gap, and it has to be read from `offsetTop`
     * — the layout position. `getBoundingClientRect` reports the *transformed*
     * position, and the rows are transformed for the whole of a drag, so the
     * measurement changed from frame to frame. Measured mid-drag on a 48px row
     * with a 4px gap: `getBoundingClientRect` gave a pitch of 0 while
     * `offsetTop` gave 52.
     */
    expect(src, 'the pitch must come from offsetTop').toMatch(/\.offsetTop - .*\.offsetTop|\.offsetLeft - .*\.offsetLeft/);
    const geometry = src.slice(src.indexOf('const geometry'), src.indexOf('const paint'));
    expect(geometry, 'geometry must not measure a rendered rect').not.toMatch(/getBoundingClientRect/);
  });

  it('should move the dragged row by the pointer travel, not by a snapped distance', () => {
    // It must be the raw travel: the displaced rows move in whole slots, and
    // the dragged row has to stay consistent with them. The arithmetic itself
    // is covered by `dragTarget` and `rowShift` above; this checks the hook
    // still translates the dragged row by the travel it measured.
    const branch = src.slice(src.indexOf('if (i === g.origin)'), src.indexOf('const shift = rowShift'));
    expect(branch).toMatch(/\$\{travel\}px/);
  });

  it('should not leave an unused measurement behind', () => {
    // `lead` was computed and never read — dead code that made the geometry
    // look like it knew something it did not.
    expect(src, 'geometry should return only what it is used for').not.toMatch(/\blead\b/);
  });
});

/*
 * When the drag's cached row references are released.
 *
 * `nodesRef` holds the only references to the rows a drag displaced, and the
 * layout effect needs them to take the transforms back off. Clearing it in
 * `pointerup` — before the effect runs — left every displaced row permanently
 * offset by one slot, so a completed drag left the list visibly wrong: rows
 * shifted up with a gap where the dragged one used to be.
 *
 * The order is the whole point, and it is invisible in a rendered assertion.
 */
describe('the drag’s cleanup order', () => {
  const src = readFileSync('src/ui/use-drag-reorder.mjs', 'utf8');

  /** The settle effect's body — the `useLayoutEffect` call, not the import. */
  const settle = () => {
    const at = src.indexOf('useLayoutEffect(() =>');
    expect(at, 'the settle effect is missing').toBeGreaterThanOrEqual(0);
    return src.slice(at, src.indexOf('}, [items, clearShifts])', at) + 25);
  };

  it('should keep the row references until the settle effect has used them', () => {
    const up = src.slice(src.indexOf('const onPointerUp'), src.indexOf('/* ------------------------------------------------------------ keyboard'));
    // The commit branch must not clear the ref; only the no-move branch may,
    // because nothing was displaced and there is nothing to settle.
    const at = up.indexOf('pendingDrop.current = true');
    expect(at, 'the commit branch is missing').toBeGreaterThanOrEqual(0);
    // Up to the `else` that starts the no-move branch. The `if` above it is a
    // single statement with no braces, so the anchor is the `else` line itself.
    const elseAt = up.indexOf('\n    else {', at);
    expect(elseAt, 'the no-move branch is missing').toBeGreaterThan(at);
    const commitBranch = up.slice(at, elseAt);
    expect(commitBranch, 'the commit branch must not clear nodesRef').not.toMatch(/nodesRef\.current = \[\]/);
  });

  it('should clear the row references in the settle effect', () => {
    expect(settle()).toMatch(/nodesRef\.current = \[\]/);
  });

  it('should clear them after the transforms, not before', () => {
    // `clearShifts` iterates `nodesRef`; clearing first would leave it with
    // nothing to iterate and the transforms would stay.
    const effect = settle();
    const clearAt = effect.indexOf('clearShifts');
    const wipeAt = effect.indexOf('nodesRef.current = []');
    expect(clearAt).toBeGreaterThanOrEqual(0);
    expect(wipeAt).toBeGreaterThan(clearAt);
  });
});

/*
 * Every transform the drag writes must be valid CSS.
 *
 * An invalid value is not an error — the browser drops the declaration and
 * `style.transform` reads back empty. That is how a real bug hid: the dragged
 * row was written as `translate3d(0, 80px, 0, 0)`, because a pre-joined
 * `"0, 80px"` was spliced into a template that added two more components.
 * `translate3d` takes exactly three lengths, so the whole declaration was
 * discarded and the row under the finger never moved while the rows around it
 * did — they piled into the same place.
 *
 * The failure is silent in every other kind of test: nothing throws, the code
 * path runs, and only the rendered pixels are wrong.
 */
describe('the transforms the drag writes', () => {
  const src = readFileSync('src/ui/use-drag-reorder.mjs', 'utf8');

  it('should write three components, never a pre-joined pair plus more', () => {
    // The shape to prevent: a template that interpolates a comma-containing
    // fragment and then adds components of its own. Comments are stripped
    // first — the code's own note quotes the bad value as an example, and a
    // guard that fires on its own documentation is one people delete.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const templates = [...code.matchAll(/`translate3d\(([^`]*)\)`/g)].map((m) => m[1]);
    expect(templates.length, 'no translate3d templates found').toBeGreaterThan(0);
    for (const t of templates) {
      // Three components means exactly two commas, once each interpolation
      // counts as one component.
      const parts = t.split(',').length;
      expect(parts, `translate3d(${t}) has ${parts} components, not 3`).toBe(3);
    }
  });

  it('should not build a transform from a fragment that already has a comma', () => {
    // `offset` held `"0, 80px"`. Any variable interpolated into a translate
    // must be a single component.
    expect(src, 'a pre-joined offset fragment is back').not.toMatch(/const offset = vertical \? `0, \$\{/);
  });
});

/*
 * The drag's arithmetic, as pure functions.
 *
 * These three were the bugs' whole surface — the row under the finger, the rows
 * that give way, and whether they overlap — and while the code lived inline in
 * a `requestAnimationFrame` callback no test could reach it. Every failure was
 * silent: a transform the browser discards is not an error, and a row that does
 * not move looks like a rendering glitch rather than a wrong number.
 *
 * The invariant that matters is here: the dragged row is translated by the raw
 * pointer distance and the displaced rows move in whole slots, so the two only
 * agree if they share one slot size. A test for either alone would have passed
 * while the rows piled up.
 */
describe('dragTarget', () => {
  const SLOT = 52;
  const N = 6;

  it('should stay on the origin until the pointer passes half a slot', () => {
    // The hysteresis. Without it the slot flickers between two as the pointer
    // jitters on the boundary.
    expect(dragTarget(0, 0, SLOT, N)).toBe(0);
    expect(dragTarget(0, 25, SLOT, N)).toBe(0);
    expect(dragTarget(0, 27, SLOT, N)).toBe(1);
    expect(dragTarget(0, SLOT, SLOT, N)).toBe(1);
  });

  it('should round rather than truncate, in both directions', () => {
    // Truncation would make a drag up need a whole slot before it moved, while
    // a drag down needed half — the same gesture behaving differently by
    // direction.
    expect(dragTarget(3, -27, SLOT, N)).toBe(2);
    expect(dragTarget(3, -25, SLOT, N)).toBe(3);
    expect(dragTarget(3, SLOT * 2, SLOT, N)).toBe(5);
    expect(dragTarget(3, -SLOT * 2, SLOT, N)).toBe(1);
  });

  it('should stop at both ends rather than running off', () => {
    expect(dragTarget(0, -500, SLOT, N)).toBe(0);
    expect(dragTarget(N - 1, 500, SLOT, N)).toBe(N - 1);
    expect(dragTarget(2, SLOT * 100, SLOT, N)).toBe(N - 1);
  });

  it('should never return an index outside the list', () => {
    for (let origin = 0; origin < N; origin += 1) {
      for (let t = -400; t <= 400; t += 7) {
        const at = dragTarget(origin, t, SLOT, N);
        expect(at, `origin ${origin}, travel ${t}`).toBeGreaterThanOrEqual(0);
        expect(at, `origin ${origin}, travel ${t}`).toBeLessThanOrEqual(N - 1);
      }
    }
  });
});

describe('rowShift', () => {
  const SLOT = 52;

  it('should move the rows between the origin and the target up when dragging down', () => {
    // origin 1 → target 3: rows 2 and 3 give way upward.
    expect(rowShift(2, 1, 3, SLOT)).toBe(-SLOT);
    expect(rowShift(3, 1, 3, SLOT)).toBe(-SLOT);
  });

  it('should move them down when dragging up', () => {
    // origin 3 → target 1: rows 1 and 2 give way downward.
    expect(rowShift(1, 3, 1, SLOT)).toBe(SLOT);
    expect(rowShift(2, 3, 1, SLOT)).toBe(SLOT);
  });

  it('should leave the rows outside the range alone', () => {
    expect(rowShift(0, 1, 3, SLOT)).toBe(0);
    expect(rowShift(4, 1, 3, SLOT)).toBe(0);
    expect(rowShift(5, 1, 3, SLOT)).toBe(0);
  });

  it('should leave the dragged row alone, so the caller can drive it', () => {
    // The dragged row follows the pointer, not a slot. If this returned a
    // shift for it the two would fight and the row would not track the finger.
    expect(rowShift(1, 1, 3, SLOT)).toBe(0);
    expect(rowShift(3, 3, 1, SLOT)).toBe(0);
  });

  it('should not move anything when the target is the origin', () => {
    for (let i = 0; i < 6; i += 1) expect(rowShift(i, 2, 2, SLOT), `row ${i}`).toBe(0);
  });

  it('should give every displaced row the same magnitude as the slot', () => {
    // The property the overlap violated: the dragged row travels the raw
    // pointer distance and these rows travel whole slots, so a slot measured
    // as anything but the pitch (row + gap) leaves them out of step.
    for (let origin = 0; origin < 5; origin += 1) {
      for (let target = 0; target < 5; target += 1) {
        for (let i = 0; i < 5; i += 1) {
          const shift = rowShift(i, origin, target, SLOT);
          expect(Math.abs(shift), `row ${i}, ${origin}→${target}`).toBeLessThanOrEqual(SLOT);
          if (shift) expect(Math.abs(shift)).toBe(SLOT);
        }
      }
    }
  });
});

/*
 * The two together: the state at the moment of the drop must be the state the
 * reorder produces.
 *
 * This is the property the user actually sees. A drag leaves the rows displaced
 * by transforms; the drop reorders the DOM and drops the transforms. If the
 * displacement and the new order disagree by even one slot, the list jumps at
 * the moment of release — or, worse, the transforms are dropped and the rows
 * land on top of each other.
 */
describe('the drop', () => {
  const SLOT = 52;
  const N = 5;

  /** Where each row sits mid-drag, as a slot offset from its resting place. */
  const displaced = (origin, travel) => {
    const target = dragTarget(origin, travel, SLOT, N);
    const out = [];
    for (let i = 0; i < N; i += 1) {
      out.push(i === origin ? travel : rowShift(i, origin, target, SLOT));
    }
    return { target, out };
  };

  /**
   * Where each row sits after the reorder, as a slot offset.
   *
   * `order` holds original indices in their new positions, so a row's shift is
   * its new position minus the index it started at — indexed by original index,
   * because that is what the caller compares against.
   */
  const reordered = (origin, target) => {
    const order = [...Array(N).keys()];
    const [moved] = order.splice(origin, 1);
    order.splice(target, 0, moved);
    const out = new Array(N);
    order.forEach((originalIndex, newPos) => {
      out[originalIndex] = (newPos - originalIndex) * SLOT;
    });
    return out;
  };

  it('should place each displaced row exactly where the reorder puts it', () => {
    for (let origin = 0; origin < N; origin += 1) {
      for (let travel = -SLOT * 3; travel <= SLOT * 3; travel += 13) {
        const { target, out } = displaced(origin, travel);
        const after = reordered(origin, target);
        for (let i = 0; i < N; i += 1) {
          // The dragged row is exempt: it tracks the pointer, and the drop
          // snaps it — that snap is what the settle effect hides.
          if (i === origin) continue;
          expect(out[i], `row ${i}: ${origin}→${target} at travel ${travel}`).toBe(after[i]);
        }
      }
    }
  });

  it('should never leave two rows claiming the same slot', () => {
    // The overlap, as arithmetic. Two rows at the same offset is exactly what
    // the user saw: the row under the finger and the row that gave way.
    for (let origin = 0; origin < N; origin += 1) {
      for (let travel = -SLOT * 3; travel <= SLOT * 3; travel += 11) {
        const { out } = displaced(origin, travel);
        // Resting positions plus displacement, sorted; the dragged row is the
        // only one allowed to sit between slots.
        const settled = out
          .map((shift, i) => ({ i, at: i * SLOT + shift }))
          .filter((r) => r.i !== origin)
          .map((r) => r.at)
          .sort((a, b) => a - b);
        for (let k = 1; k < settled.length; k += 1) {
          expect(settled[k] - settled[k - 1], `origin ${origin}, travel ${travel}`)
            .toBeGreaterThanOrEqual(SLOT);
        }
      }
    }
  });
});
