// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import SettingsMenu from '../src/ui/components/SettingsMenu.jsx';
import { LocaleProvider } from '../src/ui/LocaleContext.jsx';
import { ThemeProvider } from '../src/ui/ThemeContext.jsx';
import { IconStyleProvider } from '../src/ui/IconStyleContext.jsx';
import { DensityProvider } from '../src/ui/DensityContext.jsx';

/*
 * The settings popover has to survive a real press.
 *
 * It renders into a portal, so the panel is a sibling of the button rather
 * than a child of it. The outside-click handler tested containment against the
 * button's wrapper alone, which meant every press *inside* the panel counted as
 * an outside press: `mousedown` closed the panel, the node was removed, and the
 * `click` that follows never reached a control. The symptom was a settings
 * button that appeared to do nothing, or that opened and immediately closed.
 *
 * The tests here dispatch `mousedown` then `click`, because a test that only
 * dispatches `click` cannot see this defect at all — that is how it survived a
 * round of manual verification.
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

function wrap(node) {
  return React.createElement(LocaleProvider, { store: store() },
    React.createElement(ThemeProvider, { store: store() },
      React.createElement(IconStyleProvider, { store: store() },
        React.createElement(DensityProvider, { store: store() }, node))));
}

async function mount(node) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(wrap(node)); });
  return {
    container,
    unmount: async () => { await act(async () => { root.unmount(); }); container.remove(); },
  };
}

/** A press as the browser delivers it: mousedown, mouseup, then click. */
async function press(el) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

const settingsButton = (container) =>
  [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-haspopup') === 'dialog');

const panel = () => document.querySelector('.settings-menu');

describe('settings popover', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('should open when the settings button is pressed', async () => {
    const { container, unmount } = await mount(React.createElement(SettingsMenu));
    expect(panel()).toBeNull();
    await press(settingsButton(container));
    expect(panel()).not.toBeNull();
    await unmount();
  });

  it('should still be open after a press lands on one of its own controls', async () => {
    const { container, unmount } = await mount(React.createElement(SettingsMenu));
    await press(settingsButton(container));
    const control = panel().querySelector('button, select');
    expect(control, 'the panel rendered no controls').not.toBeNull();
    await press(control);
    expect(panel(), 'a press inside the panel dismissed it').not.toBeNull();
    await unmount();
  });

  it('should stay open across a press on each row in turn', async () => {
    const { container, unmount } = await mount(React.createElement(SettingsMenu));
    await press(settingsButton(container));
    const rows = [...panel().querySelectorAll('.settings-row')];
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const row of rows) {
      const control = row.querySelector('button, select');
      if (!control) continue;
      await press(control);
      expect(panel(), `the panel closed when its ${row.textContent} control was pressed`).not.toBeNull();
    }
    await unmount();
  });

  it('should close when a press lands outside both the button and the panel', async () => {
    const { container, unmount } = await mount(React.createElement(SettingsMenu));
    await press(settingsButton(container));
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    await press(outside);
    expect(panel()).toBeNull();
    await unmount();
  });

  it('should close on Escape', async () => {
    const { container, unmount } = await mount(React.createElement(SettingsMenu));
    await press(settingsButton(container));
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(panel()).toBeNull();
    await unmount();
  });

  it('should toggle closed when the settings button is pressed twice', async () => {
    const { container, unmount } = await mount(React.createElement(SettingsMenu));
    const btn = settingsButton(container);
    await press(btn);
    expect(panel()).not.toBeNull();
    await press(btn);
    expect(panel()).toBeNull();
    await unmount();
  });
});
