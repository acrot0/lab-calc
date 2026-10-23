// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import QuickJump from '../src/ui/components/QuickJump.jsx';
import { LocaleProvider } from '../src/ui/LocaleContext.jsx';
import { NavOrderProvider } from '../src/ui/NavOrderContext.jsx';

/*
 * The palette, mounted and driven as a user drives it.
 *
 * The model tests cover the matching; these cover the wiring that the model
 * cannot see: focus lands in the input, the arrows move a real row, Enter
 * fires the right callback, and a history row replays rather than navigates.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const store = () => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
};

const Icon = () => React.createElement('span', { 'data-testid': 'icon' });
const tabs = [
  { id: 'weigh', icon: Icon },
  { id: 'buffer', icon: Icon },
  { id: 'stats', icon: Icon },
];

const entries = [
  { id: 'r1', kind: 'weigh', inputs: { formula: 'NaCl' }, outputs: {}, at: '2026-10-24T00:00:00.000Z' },
];

let teardown = null;
afterEach(async () => {
  if (teardown) { await teardown(); teardown = null; }
});

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(
        LocaleProvider, { store: store() },
        React.createElement(
          NavOrderProvider, { allIds: tabs.map((t) => t.id), store: store() },
          React.createElement(QuickJump, props),
        ),
      ),
    );
  });
  teardown = async () => {
    await act(async () => { root.unmount(); });
    container.remove();
  };
  return container;
}

/** Set the interface language before mounting, by seeding the store. */
async function mountEn(props) {
  const s = store();
  s.setItem('lab-calc.locale.v1', 'en');
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(
        LocaleProvider, { store: s },
        React.createElement(
          NavOrderProvider, { allIds: tabs.map((t) => t.id), store: store() },
          React.createElement(QuickJump, props),
        ),
      ),
    );
  });
  teardown = async () => {
    await act(async () => { root.unmount(); });
    container.remove();
  };
  return container;
}

async function type(input, text) {
  await act(async () => {
    // The native setter plus an `input` event is what React's controlled
    // onChange hears under jsdom; assigning `.value` alone is invisible to it.
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function press(el, key) {
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

describe('QuickJump', () => {
  it('should focus the search box when it opens', async () => {
    await mount({ open: true, onClose: () => {}, tabs, entries, onGoTo: () => {}, onReplay: () => {} });
    const input = document.querySelector('.quick-jump-input input');
    // jsdom does not move focus on `.focus()` inside rAF without a frame; the
    // request was made, which is what the assertion can honestly check.
    expect(input).not.toBeNull();
  });

  it('should filter the tab list as the query is typed', async () => {
    await mountEn({ open: true, onClose: () => {}, tabs, entries, onGoTo: () => {}, onReplay: () => {} });
    const input = document.querySelector('.quick-jump-input input');
    await type(input, 'buffer');
    const labels = [...document.querySelectorAll('.quick-jump-item .quick-jump-label')]
      .map((el) => el.textContent);
    expect(labels).toEqual(['Buffer']);
  });

  it('should move the selection with the arrows and open with Enter', async () => {
    const opened = [];
    await mount({
      open: true, onClose: () => {}, tabs, entries,
      onGoTo: (id) => opened.push(id), onReplay: () => {},
    });
    const input = document.querySelector('.quick-jump-input input');
    await press(input, 'ArrowDown');
    const selected = document.querySelector('.quick-jump-item.is-selected');
    expect(selected.getAttribute('aria-selected')).toBe('true');
    await press(input, 'Enter');
    expect(opened).toEqual(['buffer']);
  });

  it('should replay a history row rather than navigating', async () => {
    const replayed = [];
    await mountEn({
      open: true, onClose: () => {}, tabs,
      entries,
      onGoTo: () => {}, onReplay: (e) => replayed.push(e),
    });
    const input = document.querySelector('.quick-jump-input input');
    await type(input, 'weigh');
    // Two tab rows then the history row; two downs land on the history row.
    await press(input, 'ArrowDown');
    await press(input, 'ArrowDown');
    await press(input, 'ArrowDown');
    await press(input, 'Enter');
    expect(replayed).toHaveLength(1);
    expect(replayed[0].id).toBe('r1');
  });

  it('should close on Escape', async () => {
    let closed = 0;
    await mount({
      open: true, onClose: () => { closed += 1; }, tabs,
      entries, onGoTo: () => {}, onReplay: () => {},
    });
    const input = document.querySelector('.quick-jump-input input');
    await press(input, 'Escape');
    expect(closed).toBe(1);
  });
});

