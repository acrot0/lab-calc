import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Every tab is rendered once, server-side.
 *
 * This exists because a missing React import shipped: a hook was added to a
 * component whose React import did not list it, so the tab threw
 * `useRef is not defined` the moment it rendered. All 600-odd unit tests
 * passed — they exercise the calculation modules, not the components — and the
 * failure only showed up in a browser.
 *
 * `renderToStaticMarkup` catches that whole class of mistake with no new
 * dependency: no jsdom, no testing library, no DOM. It does not run effects, so
 * a bug inside `useEffect` would still slip through, but a component that
 * cannot render at all is caught, and that is what shipped.
 *
 * The jsx files are imported through Vite's transform, which vitest applies to
 * the whole project, so this works without a separate build step.
 */

/** The tab components, and a label for each failure message. */
async function tabs() {
  const mods = {
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
  const out = [];
  for (const [name, load] of Object.entries(mods)) {
    out.push({ name, Component: (await load()).default });
  }
  return out;
}

/**
 * Wrap a tab in the locale provider, which every tab requires.
 *
 * The real provider rather than a hand-built context value: it is what the app
 * uses, so a tab that renders here renders there. `store` is null, which the
 * provider handles — it only uses the store to persist a preference.
 */
async function withProvider(node) {
  const { LocaleProvider } = await import('../src/ui/LocaleContext.jsx');
  return createElement(LocaleProvider, { store: null }, node);
}

describe('tab rendering', () => {
  it('should render every tab without throwing', async () => {
    const failures = [];

    for (const { name, Component } of await tabs()) {
      try {
        const html = renderToStaticMarkup(await withProvider(createElement(Component, {
          onRecord: () => {},
          restored: null,
          theme: 'dark',
        })));
        // A component that renders an empty string has not rendered.
        expect(html.length, `${name} produced no markup`).toBeGreaterThan(50);
      } catch (e) {
        failures.push(`${name}: ${e.message}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('should render every tab in the light theme too', async () => {
    // The theme is threaded through to the canvas palettes, so a tab that only
    // handles the default would fail here rather than in a browser.
    const failures = [];

    for (const { name, Component } of await tabs()) {
      try {
        renderToStaticMarkup(await withProvider(createElement(Component, {
          onRecord: () => {}, restored: null, theme: 'light',
        })));
      } catch (e) {
        failures.push(`${name} (light): ${e.message}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it('should render every tab with restored inputs', async () => {
    // Replaying a history entry passes `restored`, which is a different code
    // path through every tab's useState initialisers.
    const failures = [];
    const restored = {
      pKa: 4.76, targetPh: 5, totalConc: 0.1, conc: 0.1, volumeMl: 25,
      titrantConc: 0.1, factor: 10, steps: 5, stepVolumeMl: 100,
      stockConc: 1000, mode: 'absorbance', epsilon: 15000, pathCm: 1,
      absorbance: 0.75, reading: 0.25, acidType: 'weakAcid',
    };

    for (const { name, Component } of await tabs()) {
      try {
        renderToStaticMarkup(await withProvider(createElement(Component, {
          onRecord: () => {}, restored, theme: 'dark',
        })));
      } catch (e) {
        failures.push(`${name} (restored): ${e.message}`);
      }
    }

    expect(failures).toEqual([]);
  });
});

/**
 * The shell renders two navigations over the same tab list — a rail for desktop
 * and a horizontal bar for mobile — with a media query deciding which is shown.
 * That is one list rendered twice, which is exactly the shape that drifts: a
 * tab added to one and forgotten in the other is invisible on half the devices,
 * and nothing about the markup would look wrong.
 */
describe('app shell', () => {
  const shell = async () => {
    const { LocaleProvider } = await import('../src/ui/LocaleContext.jsx');
    const { ThemeProvider } = await import('../src/ui/ThemeContext.jsx');
    const { MaterialProvider } = await import('../src/ui/MaterialContext.jsx');
    const { default: App } = await import('../src/ui/App.jsx');
    return renderToStaticMarkup(
      createElement(LocaleProvider, { store: null },
        createElement(ThemeProvider, { store: null },
          createElement(MaterialProvider, { store: null },
            createElement(App)))),
    );
  };

  it('should render both navigations from the same tab list', async () => {
    const html = await shell();
    const rail = [...html.matchAll(/class="rail-item"/g)].length;
    const bar = [...html.matchAll(/role="tab"/g)].length;
    expect(rail, 'rail items').toBeGreaterThan(0);
    expect(bar, 'tab buttons').toBeGreaterThan(0);
    // Equal counts is the check: both render TABS.map, so a tab added to one
    // and missed in the other fails here.
    expect(rail, 'rail and tab bar disagree on the tab count').toBe(bar);
  });

  it('should name the tab in each navigation', async () => {
    // A rail item with no accessible name is an icon and a shrug. The label is
    // in the DOM whether or not the CSS is showing it.
    const html = await shell();
    const labels = [...html.matchAll(/class="rail-label">([^<]*)</g)].map((m) => m[1]);
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) expect(l.trim(), 'rail label').not.toBe('');
    // Not an untranslated key: `t()` returns the key itself when it is missing,
    // which renders as `tabs.weigh`.
    for (const l of labels) expect(l, 'untranslated rail label').not.toMatch(/^tabs\./);
  });

  it('should mark exactly one tab as the current page', async () => {
    const html = await shell();
    expect([...html.matchAll(/aria-current="page"/g)].length).toBe(1);
    expect([...html.matchAll(/aria-selected="true"/g)].length).toBe(1);
  });

  it('should publish the material on the control', async () => {
    // The toggle's label names the material in effect, so it must not be blank
    // or an untranslated key.
    const html = await shell();
    const m = html.match(/class="control-label">([^<]*)</);
    expect(m, 'no control label rendered').not.toBeNull();
    expect(m[1]).not.toMatch(/^material\./);
  });
});
