// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../src/ui/LocaleContext.jsx';

/*
 * React refuses to batch updates through `act` unless the environment says it
 * is a test. Without this flag every mount logs "not configured to support
 * act(...)" and the assertion below — which fails on any logged error — fails
 * on the noise rather than on a real problem.
 */
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Every tab is mounted into a real DOM, with effects.
 *
 * This is the layer the server-side render test cannot reach. `useEffect` does
 * not run under `renderToStaticMarkup`, and every chart in this app draws in an
 * effect — so a `ReferenceError` inside one of them left the server test green
 * while the browser showed a blank page. That happened: a palette constant was
 * used in SpectroTab but defined in CurveTab, and React unmounted the whole
 * tree on the throw.
 *
 * jsdom is the cost of covering that. It is a dev dependency and it never
 * ships, which is a better trade than shipping a blank page.
 *
 * Canvas is stubbed: jsdom has no 2D context, and what is being tested is
 * whether the drawing code runs at all, not what it draws. The stub records
 * calls so a test can assert the chart actually drew something rather than
 * silently returning early.
 */

/** Minimal 2D context: every method a no-op, every property settable. */
function stubCanvas() {
  const calls = [];
  const ctx = new Proxy({}, {
    get(_t, prop) {
      if (prop === '__calls') return calls;
      return (...args) => { calls.push([String(prop), args]); };
    },
    set() { return true; },
  });

  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext() { return ctx; };
  return { ctx, calls, restore: () => { HTMLCanvasElement.prototype.getContext = original; } };
}

/** Mount a node and return the container, wrapped in act so effects flush. */
async function mount(node) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(node); });
  return { container, root, unmount: async () => { await act(async () => { root.unmount(); }); container.remove(); } };
}

/** The tab modules, loaded lazily so a broken one fails its own test. */
const TABS = {
  weigh: () => import('../src/ui/tabs/WeighTab.jsx'),
  dilute: () => import('../src/ui/tabs/DiluteTab.jsx'),
  buffer: () => import('../src/ui/tabs/BufferTab.jsx'),
  series: () => import('../src/ui/tabs/SeriesTab.jsx'),
  convert: () => import('../src/ui/tabs/ConvertTab.jsx'),
  ph: () => import('../src/ui/tabs/PhTab.jsx'),
  percent: () => import('../src/ui/tabs/PercentTab.jsx'),
  curve: () => import('../src/ui/tabs/CurveTab.jsx'),
  reagent: () => import('../src/ui/tabs/ReagentTab.jsx'),
  spectro: () => import('../src/ui/tabs/SpectroTab.jsx'),
  lab: () => import('../src/ui/tabs/LabTab.jsx'),
  colligative: () => import('../src/ui/tabs/ColligativeTab.jsx'),
  reaction: () => import('../src/ui/tabs/ReactionTab.jsx'),
  electro: () => import('../src/ui/tabs/ElectroTab.jsx'),
  elements: () => import('../src/ui/tabs/ElementsTab.jsx'),
};

/** Any error React logs during a mount, so a caught throw is not missed. */
let logged;
beforeEach(() => {
  logged = [];
  const original = console.error;
  console.error = (...args) => { logged.push(args.map(String).join(' ')); original(...args); };
  return () => { console.error = original; };
});

afterEach(() => { document.body.innerHTML = ''; });

describe('tab mounting with effects', () => {
  it('should mount every tab without throwing or logging an error', async () => {
    const canvas = stubCanvas();
    const failures = [];
    try {
      for (const [name, load] of Object.entries(TABS)) {
        const { default: Component } = await load();
        try {
          const { unmount } = await mount(
            React.createElement(LocaleProvider, { store: null },
              React.createElement(Component, { onRecord: () => {}, restored: null, theme: 'dark' })),
          );
          await unmount();
        } catch (e) {
          failures.push(`${name}: ${e.message}`);
        }
      }
    } finally {
      canvas.restore();
    }
    // React logs rather than throws for an error inside an effect in some
    // paths, so the console is checked too — that is how the blank page
    // presented itself.
    expect([...failures, ...logged]).toEqual([]);
  }, 60000);

  it('should mount every tab in the light theme', async () => {
    const canvas = stubCanvas();
    const failures = [];
    try {
      for (const [name, load] of Object.entries(TABS)) {
        const { default: Component } = await load();
        try {
          const { unmount } = await mount(
            React.createElement(LocaleProvider, { store: null },
              React.createElement(Component, { onRecord: () => {}, restored: null, theme: 'light' })),
          );
          await unmount();
        } catch (e) {
          failures.push(`${name} (light): ${e.message}`);
        }
      }
    } finally {
      canvas.restore();
    }
    expect([...failures, ...logged]).toEqual([]);
  }, 60000);

  it('should reach every mode of every tab that has modes', async () => {
    /*
     * The bug this catches: a chart component referenced a constant that did
     * not exist in its file. It only threw when that chart rendered, which only
     * happened in one of the tab's three modes — so mounting the tab was not
     * enough, and the first version of this test passed with the bug present.
     *
     * Each tab's mode selector is driven through every option, and the tab's
     * calculate button is pressed in each. That is the path a user takes, and
     * it is the path the failure was on.
     */
    const canvas = stubCanvas();
    const failures = [];
    try {
      for (const [name, load] of Object.entries(TABS)) {
        const { default: Component } = await load();
        const { container, unmount } = await mount(
          React.createElement(LocaleProvider, { store: null },
            React.createElement(Component, { onRecord: () => {}, restored: null, theme: 'dark' })),
        );

        const selects = [...container.querySelectorAll('select')];
        const modes = selects.length > 0 ? [...selects[0].options].map((o) => o.value) : [null];

        for (const mode of modes) {
          try {
            if (mode !== null) {
              const select = container.querySelector('select');
              // React tracks the value internally, so the native setter is
              // called and a change event dispatched — setting `.value`
              // directly leaves React believing nothing changed.
              const setter = Object.getOwnPropertyDescriptor(
                window.HTMLSelectElement.prototype, 'value',
              ).set;
              await act(async () => {
                setter.call(select, mode);
                select.dispatchEvent(new Event('change', { bubbles: true }));
              });
            }

            const button = [...container.querySelectorAll('button')]
              .find((b) => /计算|Calculate/.test(b.textContent));
            if (button) {
              await act(async () => {
                button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
              });
            }
          } catch (e) {
            failures.push(`${name} (${mode ?? 'default'}): ${e.message}`);
          }
        }
        await unmount();
      }
    } finally {
      canvas.restore();
    }
    expect([...failures, ...logged]).toEqual([]);
  }, 90000);

  it('should draw a chart when a tab that has one is given data', async () => {
    // The stub makes a chart's drawing observable. Without this, a chart whose
    // effect silently returned early would pass every test above.
    const canvas = stubCanvas();
    try {
      const { default: CurveTab } = await import('../src/ui/tabs/CurveTab.jsx');
      const { container, unmount } = await mount(
        React.createElement(LocaleProvider, { store: null },
          React.createElement(CurveTab, { onRecord: () => {}, restored: null, theme: 'dark' })),
      );

      // Press the tab's own button rather than reaching into its state.
      const button = [...container.querySelectorAll('button')]
        .find((b) => /计算|Calculate/.test(b.textContent));
      expect(button, 'the curve tab should have a calculate button').toBeTruthy();
      await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

      expect(canvas.calls.length, 'the chart should have drawn something').toBeGreaterThan(0);
      await unmount();
    } finally {
      canvas.restore();
    }
  }, 30000);
});
