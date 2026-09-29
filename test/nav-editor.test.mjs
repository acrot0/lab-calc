// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../src/ui/LocaleContext.jsx';
import { NavOrderProvider } from '../src/ui/NavOrderContext.jsx';
import NavEditor from '../src/ui/components/NavEditor.jsx';
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
    expect(grip, 'the grip should start the drag').toMatch(/onPointerDown=\{handlers\.onPointerDown/);
    const li = src.slice(src.indexOf('data-reorder-item'), src.indexOf('data-reorder-item') + 900);
    expect(li, 'the row should not start a drag').not.toMatch(/onPointerDown=/);
  });
});
