// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../src/ui/LocaleContext.jsx';
import { SCENARIOS } from '../src/ui/scenarios.mjs';

/*
 * Every scenario, actually run.
 *
 * `scenarios.test.mjs` checks the shape of the data; this checks that the tab
 * accepts it. The two failures are different and only one of them is visible
 * without a DOM:
 *
 * - a scenario naming a field the tab does not read is caught by the shape
 *   test, because the field keeps its default;
 * - a scenario whose *format* is wrong — a comma list where the tab wants one
 *   `time, value` pair per line — parses to nothing and the tab reports an
 *   error next to the field. That is invisible to a static check and shows up
 *   only when the tab runs.
 *
 * The second kind was found by clicking through all twenty tabs in a browser,
 * which is not a thing that happens before every release. This is that sweep,
 * as a test.
 *
 * Canvas is stubbed the same way `dom-render.test.mjs` stubs it: jsdom has no
 * 2D context and what is being tested is whether the tab runs, not what it
 * draws.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function stubCanvas() {
  const ctx = new Proxy({}, {
    get: () => () => {},
    set: () => true,
  });
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext() { return ctx; };
  return () => { HTMLCanvasElement.prototype.getContext = original; };
}

/** The tab modules, loaded lazily so a broken one fails only its own case. */
const LOADERS = {
  weigh: () => import('../src/ui/tabs/WeighTab.jsx'),
  dilute: () => import('../src/ui/tabs/DiluteTab.jsx'),
  buffer: () => import('../src/ui/tabs/BufferTab.jsx'),
  series: () => import('../src/ui/tabs/SeriesTab.jsx'),
  ph: () => import('../src/ui/tabs/PhTab.jsx'),
  percent: () => import('../src/ui/tabs/PercentTab.jsx'),
  curve: () => import('../src/ui/tabs/CurveTab.jsx'),
  reagent: () => import('../src/ui/tabs/ReagentTab.jsx'),
  spectro: () => import('../src/ui/tabs/SpectroTab.jsx'),
  lab: () => import('../src/ui/tabs/LabTab.jsx'),
  colligative: () => import('../src/ui/tabs/ColligativeTab.jsx'),
  bio: () => import('../src/ui/tabs/BioTab.jsx'),
  reaction: () => import('../src/ui/tabs/ReactionTab.jsx'),
  electro: () => import('../src/ui/tabs/ElectroTab.jsx'),
  convert: () => import('../src/ui/tabs/ConvertTab.jsx'),
  uncertainty: () => import('../src/ui/tabs/UncertaintyTab.jsx'),
  stats: () => import('../src/ui/tabs/StatsTab.jsx'),
  analytical: () => import('../src/ui/tabs/AnalyticalTab.jsx'),
  physical: () => import('../src/ui/tabs/PhysicalTab.jsx'),
};

let teardown = null;
afterEach(async () => {
  if (teardown) { await teardown(); teardown = null; }
});

/** Mount a tab seeded with a scenario, press its calculate button, return text. */
async function runScenario(scenario) {
  const load = LOADERS[scenario.tab];
  expect(load, `no loader for ${scenario.tab}`).toBeDefined();
  const mod = await load();
  const Tab = mod.default;

  const restoreCanvas = stubCanvas();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  const errors = [];
  const originalError = console.error;
  console.error = (...args) => { errors.push(args.map(String).join(' ')); };

  try {
    await act(async () => {
      root.render(
        React.createElement(LocaleProvider, null,
          React.createElement(Tab, { onRecord: () => {}, restored: scenario.inputs })),
      );
    });

    // The tab's own primary button, by the labels the tabs actually use.
    const button = [...container.querySelectorAll('button')]
      .find((b) => /计算|绘制|配平|换算|生成|求解/.test(b.textContent.trim()));
    if (button) {
      // `act` flushes the resulting render and its effects synchronously, so no
      // timer is needed to let the calculation land — which is also why this
      // file has none to leak.
      await act(async () => { button.click(); });
    }

    /*
     * Only the elements the app uses to report a problem.
     *
     * A blanket text scan matches the field hints — "Must be greater than 1" is
     * a permanent constraint printed under a valid input, not a complaint — and
     * the first version of this test failed on exactly that. `Err` renders into
     * `.msg-err` and a bad input gets `.field-error`; nothing else on a tab is
     * a report of failure.
     */
    const problems = [...container.querySelectorAll('.msg-err, .field-error, [role="alert"]')]
      .map((el) => el.textContent.trim())
      .filter(Boolean);

    return { html: container.textContent, errors, problems };
  } finally {
    console.error = originalError;
    await act(async () => { root.unmount(); });
    container.remove();
    restoreCanvas();
    teardown = async () => {};
  }
}

describe('every scenario runs in its tab', () => {
  for (const scenario of SCENARIOS) {
    it(`should run the ${scenario.tab} scenario without an error message`, async () => {
      const { errors, problems } = await runScenario(scenario);

      // The tab's own error slot. A scenario whose data is the wrong *format*
      // lands here — the physical tab reports an unparseable list as "这几行读不
      // 出来" next to the field rather than throwing.
      expect(problems, `the ${scenario.tab} scenario reported: ${problems.join(' | ')}`).toEqual([]);

      // React logs a render failure through `console.error` rather than
      // throwing out of the click, so an error boundary or a bad child would
      // otherwise pass this test.
      const reactError = errors.find((e) => /not a function|undefined|Cannot read/i.test(e));
      expect(reactError ?? null, `the ${scenario.tab} scenario logged: ${reactError}`).toBeNull();
    });
  }
});
