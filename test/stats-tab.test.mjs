// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import StatsTab from '../src/ui/tabs/StatsTab.jsx';
import { LocaleProvider } from '../src/ui/LocaleContext.jsx';

/*
 * The stats tab's own button, pressed for real.
 *
 * `run()` bound the t-test result to a local named `t`, shadowing the
 * translator that `useI18n()` returns for the rest of the function. The
 * `recordSummary(..., t)` call below it therefore received a result object
 * where a translator was expected, threw, and the tab showed
 * "t is not a function" — in the minified build, "n is not a function".
 *
 * Every existing sweep missed it for the same reason: they look for a button
 * matching 计算/Calculate, and this tab's button is labelled 检验与比较. A test
 * that only presses buttons with the expected word cannot see a button that
 * has a different one.
 *
 * So this presses the button by what it does, and asserts on the outcomes that
 * were lost: the tests run, and the calculation is recorded.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const store = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

async function mount(node) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(LocaleProvider, { store: store() }, node)); });
  return { container, unmount: async () => { await act(async () => { root.unmount(); }); container.remove(); } };
}

function setText(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const fields = (c) => [...c.querySelectorAll('textarea, input[type="text"]')];
const runButton = (c) => [...c.querySelectorAll('button')]
  .find((b) => b.className.includes('primary'));

describe('stats tab', () => {
  it('should run its tests and record a result when its own button is pressed', async () => {
    const recorded = [];
    const { container, unmount } = await mount(
      React.createElement(StatsTab, { onRecord: (e) => recorded.push(e), restored: null }),
    );

    const btn = runButton(container);
    expect(btn, 'the run button was not found').toBeTruthy();
    await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    // The bug surfaced as this text; assert on the absence of any thrown
    // message rather than on a specific success string.
    const shown = container.textContent;
    expect(shown).not.toMatch(/is not a function/);
    expect(recorded.length, 'nothing was recorded').toBe(1);
    expect(recorded[0].kind).toBe('stats');
    expect(recorded[0].summary).toBeTruthy();
    expect(recorded[0].outputs.n).toBe(5);
    await unmount();
  });

  it('should produce a Welch t test and an F test when a second sample is given', async () => {
    const recorded = [];
    const { container, unmount } = await mount(
      React.createElement(StatsTab, { onRecord: (e) => recorded.push(e), restored: null }),
    );

    const f = fields(container);
    await act(async () => { setText(f[1], '9.90, 9.95, 10.00, 9.92, 9.97'); });
    await act(async () => { runButton(container).dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const text = container.textContent;
    expect(text).not.toMatch(/is not a function/);
    expect(text).toMatch(/Welch/);
    expect(text).toMatch(/F\s*=/);
    // The values a hand calculation gives for these two samples.
    expect(text).toContain('3.3072');
    expect(text).toContain('2.3433');
    await unmount();
  });

  it('should still render its summary live, before any button is pressed', async () => {
    const { container, unmount } = await mount(
      React.createElement(StatsTab, { onRecord: () => {}, restored: null }),
    );
    // The describe half is not behind a button, so it must be there already.
    expect(container.textContent).toMatch(/10\.02|均值|Mean/);
    await unmount();
  });
});
