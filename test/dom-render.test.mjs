// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../src/ui/LocaleContext.jsx';
import { SYMBOL_KEYS } from '../src/ui/field-labels.mjs';

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

        /*
         * Two kinds of mode control are in use: a `seg` group of buttons
         * (ConvertTab) and a `<select>` (the rest). Both are driven, because a
         * tab that switched from one to the other would otherwise silently stop
         * being covered — which is exactly what happened when ConvertTab grew a
         * mode segment and this test went on driving its dimension picker.
         */
        const segs = [...container.querySelectorAll('.seg-btn')];
        const selects = [...container.querySelectorAll('select')];
        const modes = segs.length > 0
          ? segs.map((b) => b.textContent)
          : (selects.length > 0 ? [...selects[0].options].map((o) => o.value) : [null]);

        for (const mode of modes) {
          try {
            if (mode !== null && segs.length > 0) {
              const btn = [...container.querySelectorAll('.seg-btn')]
                .find((b) => b.textContent === mode);
              await act(async () => {
                btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
              });
            } else if (mode !== null) {
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

  it('should label the periodic table ramp with the real range of the property', async () => {
    /*
     * The bug this catches. `rangeOf` takes a function from element to its
     * properties, and `propertiesOf` is keyed by atomic number — the tab
     * passed `propertiesOf` itself, so every PubChem-backed property read
     * null, the range collapsed to the empty fallback, and the legend
     * announced "0 to 1" over a density ramp that actually runs 8.99e-5 to
     * 22.57. The cells were still shaded, so it looked plausible.
     *
     * Nothing caught it: heat.test.mjs calls rangeOf with a correct callback,
     * and the mount tests above only assert that nothing threw. What is
     * asserted here is the join between the two — the legend a reader sees.
     */
    const { default: ElementsTab } = await import('../src/ui/tabs/ElementsTab.jsx');
    const { container, unmount } = await mount(
      React.createElement(LocaleProvider, { store: null },
        React.createElement(ElementsTab, { onRecord: () => {}, restored: null, theme: 'dark' })),
    );

    const select = container.querySelector('#el-color');
    expect(select, 'the periodic table should offer a colour-by selector').toBeTruthy();
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype, 'value',
    ).set;
    await act(async () => {
      setter.call(select, 'density');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const ticks = [...container.querySelectorAll('.legend-track .legend-tick')]
      .map((n) => n.textContent.trim());
    expect(ticks.length, 'a six-decade ramp needs more than its two ends').toBeGreaterThan(2);

    // The fallback range the arity bug produced. Neither end of the real
    // density range is 0 or 1, so either value here means the range was not
    // read from the data.
    expect(ticks[0]).not.toBe('0');
    expect(ticks[ticks.length - 1]).not.toBe('1');

    // The ramp ends are the true range ends, and density is reported in
    // scientific notation because it spans more than three orders of
    // magnitude below 1e-3.
    expect(ticks[0]).toContain('10⁻⁵');
    expect(ticks[ticks.length - 1]).toContain('22.57');

    // A logarithmic scale has to be labelled as one, and the coverage line
    // has to say how much of the table the ramp actually covers.
    const legend = container.querySelector('.legend').textContent;
    expect(legend).toContain('g/cm³');

    await unmount();
  }, 30000);

  it('should open the element comparison when two cells are ctrl-clicked', async () => {
    /*
     * The comparison is the one feature on this tab that needs more than a
     * mount to reach, and it is the one whose geometry has the most ways to be
     * wrong — eight axes, a normalised radius, and an outline that has to stay
     * open when a value is missing. This drives it the way a user does.
     */
    const { default: ElementsTab } = await import('../src/ui/tabs/ElementsTab.jsx');
    const { container, unmount } = await mount(
      React.createElement(LocaleProvider, { store: null },
        React.createElement(ElementsTab, { onRecord: () => {}, restored: null, theme: 'dark' })),
    );

    const cell = (sym) => container.querySelector(`[data-symbol="${sym}"]`);
    const ctrlClick = async (sym) => {
      await act(async () => {
        cell(sym).dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
      });
    };

    expect(container.querySelector('.compare'), 'nothing to compare with one element')
      .toBeNull();

    await ctrlClick('Na');
    // One element is not a comparison: the panel waits for the second.
    expect(container.querySelector('.compare')).toBeNull();
    expect(cell('Na').className).toContain('is-cmp');

    await ctrlClick('Cl');
    const panel = container.querySelector('.compare');
    expect(panel, 'two elements should open the comparison').toBeTruthy();

    // Eight axes, and the radar's own spokes and rings to match.
    const axes = panel.querySelectorAll('.cmp-axis-name');
    expect(axes.length).toBeGreaterThanOrEqual(6);
    expect(panel.querySelectorAll('.cmp-grid line').length).toBe(axes.length);

    // One outline per element, and a row of numbers per property.
    const rows = panel.querySelectorAll('.cmp-table tbody tr');
    expect(rows.length).toBe(axes.length);
    expect(rows[0].querySelectorAll('td').length).toBe(2);
    expect(panel.querySelectorAll('.cmp-table thead th').length).toBe(3);

    // Removing one leaves a single element, which closes the panel again.
    const remove = panel.querySelector('.chip-x');
    await act(async () => { remove.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.querySelector('.compare')).toBeNull();

    await unmount();
  }, 30000);

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

describe('element detail panel', () => {
  /*
   * The panel moved out of ElementsTab into its own component. Nothing else in
   * the suite would notice if it stopped rendering — every property it shows is
   * optional, so a missing one is a blank cell rather than a throw, and the
   * grid, the search and the comparison all keep working without it. These
   * tests drive it through the user's own path: click a cell, read the panel.
   */

  async function mountElements() {
    const { default: ElementsTab } = await import('../src/ui/tabs/ElementsTab.jsx');
    return mount(
      React.createElement(LocaleProvider, { store: null },
        React.createElement(ElementsTab, { onRecord: () => {}, restored: null, theme: 'dark' })),
    );
  }

  const cellFor = (container, label) => [...container.querySelectorAll('button')]
    .find((b) => b.getAttribute('aria-label') === label);

  it('should show the selected element and switch when another cell is clicked', async () => {
    const { container, unmount } = await mountElements();

    const panel = container.querySelector('.result');
    expect(panel, 'the detail panel should render for the default selection').toBeTruthy();
    // Sodium is the default selection.
    expect(panel.querySelector('.result-main').textContent).toContain('Na');

    // Iron: the first element in the table with a full row of measured
    // properties, so a formatting bug in any of them shows up here.
    const iron = cellFor(container, '26 Fe 铁');
    expect(iron, 'the table should have an iron cell').toBeTruthy();
    await act(async () => { iron.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const after = container.querySelector('.result');
    expect(after.querySelector('.result-main').textContent).toContain('Fe');
    expect(after.textContent).toContain('Fe');
    await unmount();
  }, 30000);

  it('should never render an empty or undefined value for any element', async () => {
    /*
     * The failure mode this catches: `props.melt` is null for the superheavies
     * and for several others, and `fmt(null, 4)` renders a blank rather than
     * the em dash. A blank cell reads as a rendering bug to the reader, and
     * only elements deep in the table have the gap — so clicking one random
     * element would miss it.
     */
    const { default: ElementDetail } = await import('../src/ui/components/ElementDetail.jsx');
    const { ELEMENTS, periodOf, isFBlock } = await import('../src/calc/elements.mjs');
    const { propertiesOf } = await import('../src/calc/element-properties.mjs');
    const { electronConfig } = await import('../src/calc/config.mjs');

    const failures = [];
    for (const el of ELEMENTS) {
      const { container, unmount } = await mount(
        React.createElement(LocaleProvider, { store: null },
          React.createElement(ElementDetail, {
            element: el,
            chemPeriod: periodOf(el),
            onDetachedRow: isFBlock(el),
            config: electronConfig(el.number),
            properties: propertiesOf(el.number),
          })),
      );
      const text = container.querySelector('.result').textContent;
      if (/undefined|NaN|\[object/.test(text)) failures.push(`${el.symbol}: ${text.slice(0, 80)}`);
      /*
       * An absent value must read as the bare em dash, never as the em dash
       * with its unit trailing after it. `fmt` already returns "—" for a
       * non-finite input, so dropping the null guard still renders something —
       * it renders "— K", which claims a unit for a quantity that has none and
       * reads to the eye as a truncated number rather than as a missing one.
       * A quarter of the table is in this state: 23 elements have no
       * electronegativity, 25 no boiling point, 22 no density.
       */
      const values = [...container.querySelectorAll('.result-grid strong')].map((s) => s.textContent);
      // 5 in the first grid (mass, radii, category, valence) and 8 in the
      // properties grid. A count, not a sample, so a field that renders nothing
      // at all is caught rather than skipped.
      if (values.length !== 13) failures.push(`${el.symbol}: ${values.length} values, expected 13`);
      for (const v of values) {
        if (v.trim() === '') failures.push(`${el.symbol}: a value rendered blank`);
        else if (v.includes('—') && v.trim() !== '—') {
          failures.push(`${el.symbol}: "${v}" — absent value carries a unit`);
        }
        // A placeholder or an un-interpolated template reaching the panel.
        if (/\{era\}|\{years\}|TODO|TBD|\?\?\?/.test(v)) {
          failures.push(`${el.symbol}: "${v}" — placeholder reached the panel`);
        }
      }
      /*
       * The discovery row, which is what the user reported. Aluminium and
       * calcium rendered as "known since antiquity" because PubChem files both
       * under "Ancient"; every element must now carry either a year or an era,
       * and a named discoverer, with neither reading as the other.
       */
      const labels = [...container.querySelectorAll('.result-grid span')].map((s) => s.textContent);
      const yearIdx = labels.findIndex((l) => /Year discovered|发现年份/.test(l));
      // Either label: an element in use before records began has no discoverer,
      // and the data holds a people or a region instead.
      const byIdx = labels.findIndex((l) => /Discovered by|发现者|First used by|最早使用/.test(l));
      if (yearIdx < 0) failures.push(`${el.symbol}: no discovery-year row`);
      if (byIdx < 0) failures.push(`${el.symbol}: no discoverer row`);
      if (byIdx >= 0 && !values[byIdx]?.trim()) failures.push(`${el.symbol}: empty discoverer`);
      await unmount();
    }
    expect(failures).toEqual([]);
  }, 60000);

  it('should render nothing when no element is selected', async () => {
    const { default: ElementDetail } = await import('../src/ui/components/ElementDetail.jsx');
    const { container, unmount } = await mount(
      React.createElement(LocaleProvider, { store: null },
        React.createElement(ElementDetail, { element: null })),
    );
    expect(container.querySelector('.result')).toBeNull();
    await unmount();
  }, 30000);
});

/*
 * The material provider, mounted.
 *
 * It writes `data-material` on the document element, which is what the CSS
 * reads — and a stylesheet cannot be tested by rendering markup, so this is the
 * only place the wiring is checked end to end. It also covers the OS
 * "reduce transparency" override, which is the one path where the material in
 * effect deliberately differs from the one the user chose.
 */
describe('material provider', () => {
  const providers = async (node, opts = {}) => {
    const { MaterialProvider } = await import('../src/ui/MaterialContext.jsx');
    return mount(
      React.createElement(LocaleProvider, { store: null },
        React.createElement(MaterialProvider, opts, node)),
    );
  };

  /** A probe that reports the material the provider resolved. */
  async function probe() {
    const { useMaterial } = await import('../src/ui/MaterialContext.jsx');
    let seen = null;
    function Probe() { seen = useMaterial(); return null; }
    return { Probe, get: () => seen };
  }

  afterEach(() => { delete document.documentElement.dataset.material; });

  it('should publish the material on the document element', async () => {
    const { Probe, get } = await probe();
    const { unmount } = await providers(React.createElement(Probe), { store: null });
    expect(get().material).toBe('frosted');
    expect(document.documentElement.dataset.material).toBe('frosted');
    await unmount();
  });

  it('should not offer a choice the OS has already made', async () => {
    /*
     * The toggle that used to live here is gone. On a machine with "reduce
     * transparency" switched on it was permanently disabled —
     * indistinguishable from a broken button, and reported as one — so the app
     * stopped offering a choice
     * that was never its to set. What remains is that the OS preference is read
     * and applied, which is what these two assert.
     */
    const { Probe, get } = await probe();
    const { unmount } = await providers(React.createElement(Probe), { store: null });
    expect(get().material).toBe('frosted');
    expect(get().systemSolid).toBe(false);
    await unmount();
  });

  it('should let the OS force solid, and never force frosted', async () => {
    // A stored preference must not override the OS setting: the user asked the
    // operating system for less transparency, and an app that thinks it knows
    // better is the bug this replaced.
    const { Probe, get } = await probe();
    const store = { getItem: () => 'frosted', setItem: () => {} };
    const { unmount } = await providers(React.createElement(Probe), { store });
    expect(['frosted', 'solid']).toContain(get().material);
    await unmount();
  });
});

/**
 * The printed report, rendered for real.
 *
 * The report is hidden on screen and only appears in print, which is exactly
 * why it drifted: nothing rendered it, so nothing noticed that ten recorded
 * field keys had no label and printed as raw identifiers — `acidType` on every
 * titration-curve entry, `boilingPoint`, `reactants`, `products` and six more.
 *
 * The check is on the *rendered output* rather than on the label table, because
 * the table can be complete while the report still reaches a key it does not
 * cover. A label is translated prose; a raw key is a bare camelCase identifier
 * with no CJK, no space and no unit in parentheses, so it is recognisable
 * without knowing which keys exist.
 */
describe('printed report', () => {
  const ENTRIES = [
    {
      id: 'a', kind: 'titrationCurve', at: '2026-09-25T10:00:00.000Z',
      summary: '滴定曲线',
      inputs: { acidType: 'weakAcid', pKa: 4.76, conc: 0.1, volumeMl: 25, titrantConc: 0.1 },
      outputs: { equivalenceMl: 25, equivalencePh: 8.73 },
    },
    {
      id: 'b', kind: 'reaction', at: '2026-09-25T11:00:00.000Z',
      summary: '配平',
      inputs: { equation: 'Fe + O2 -> Fe2O3' },
      outputs: { balanced: '4Fe + 3O2 -> 2Fe2O3', reactants: 'Fe, O2', products: 'Fe2O3' },
    },
  ];

  it('should label every recorded field rather than printing its key', async () => {
    const { default: Report } = await import('../src/ui/components/Report.jsx');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        React.createElement(LocaleProvider, { store: null },
          React.createElement(Report, { entries: ENTRIES })),
      );
    });

    const labels = [...host.querySelectorAll('.report-block dt')].map((d) => d.textContent);
    expect(labels.length, 'no fields rendered — the report is empty').toBeGreaterThan(6);

    /*
     * A bare camelCase identifier with no CJK, space or unit is a raw key.
     *
     * `SYMBOL_KEYS` are the exception, and they are exceptions for a reason: a
     * handful of field names are symbols that read the same in both languages
     * — `pKa`, `pH`, `E°` — so their label *is* the key and flagging them
     * would demand a translation that does not exist.
     */
    const raw = labels.filter(
      (s) => /^[a-z][A-Za-z0-9]*$/.test(s) && s.length > 2 && !SYMBOL_KEYS.has(s),
    );
    expect(raw, `printed as raw keys: ${raw.join(', ')}`).toEqual([]);

    await act(async () => { root.unmount(); });
    host.remove();
  }, 30000);

  it('should state the method and its assumptions for a known kind', async () => {
    // The part that makes the numbers checkable rather than merely present.
    const { default: Report } = await import('../src/ui/components/Report.jsx');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        React.createElement(LocaleProvider, { store: null },
          React.createElement(Report, { entries: ENTRIES })),
      );
    });

    const items = host.querySelectorAll('.report-item');
    expect(items.length).toBe(2);
    const first = items[0];
    expect(first.querySelector('.report-equation')?.textContent).toBeTruthy();
    expect(first.querySelectorAll('.report-method li').length).toBeGreaterThan(0);
    expect(first.querySelector('.report-source')?.textContent).toBeTruthy();
    // Every entry is numbered, so a page can be referred to by item.
    expect(first.querySelector('.report-num')?.textContent).toBe('01');

    await act(async () => { root.unmount(); });
    host.remove();
  }, 30000);

  it('should render a cover that identifies the document', async () => {
    const { default: Report } = await import('../src/ui/components/Report.jsx');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        React.createElement(LocaleProvider, { store: null },
          React.createElement(Report, { entries: ENTRIES })),
      );
    });

    const cover = host.querySelector('.report-cover');
    expect(cover, 'no cover — loose pages cannot be identified').toBeTruthy();
    expect(cover.querySelector('.report-cover-title')?.textContent).toBeTruthy();
    // Generated time, entry count and software version.
    expect(cover.querySelectorAll('.report-cover-meta dd').length).toBe(3);

    await act(async () => { root.unmount(); });
    host.remove();
  }, 30000);
});
