// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../src/ui/LocaleContext.jsx';
import SpectroTab from '../src/ui/tabs/SpectroTab.jsx';
import { STORAGE_KEY as LOCALE_KEY } from '../src/ui/i18n.mjs';

/*
 * The spectrophotometry tab's uncertainty budget.
 *
 * The budget has a property the other tabs' do not: which terms apply depends
 * on the *direction* of the calculation, because the tab solves the same
 * equation for two different unknowns.
 *
 *   A = ε·c·l      given c and l, return A  →  the cell's path is an input
 *   c = A/(ε·l)    given A and l, return c  →  the cell's path is a divisor
 *
 * In the first case a tolerance on the path cannot move a number computed from
 * that path as a known quantity, so the cell contributes nothing. In the second
 * it divides into the answer, so it does. Getting this wrong showed 0.436% in
 * the panel while the result above it said 0.327% — two relative uncertainties
 * for one calculation, which is exactly what the panel exists to prevent.
 *
 * The tab crashed on first render before this was written: the shared panel
 * frame read `budget.flask.value` unconditionally, and a spectrophotometry
 * budget has no flask. That is the other thing these tests hold down.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/*
 * Pinned to Chinese rather than left to jsdom's navigator, which reports en-US.
 * The assertions below match the visible labels, and a test that reads English
 * on one machine and Chinese on another is a test that fails somewhere else.
 */
const zhStore = { getItem: (k) => (k === LOCALE_KEY ? 'zh' : null), setItem: () => {} };

let logged;
beforeEach(() => {
  logged = [];
  const original = console.error;
  console.error = (...args) => { logged.push(args.map(String).join(' ')); original(...args); };
  return () => { console.error = original; };
});

afterEach(() => { document.body.innerHTML = ''; });

/** Mount the tab and return a driver bound to its DOM. */
async function mountTab() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(LocaleProvider, { store: zhStore },
        React.createElement(SpectroTab, { onRecord: () => {}, restored: null, theme: 'dark' })),
    );
  });
  const unmount = async () => { await act(async () => { root.unmount(); }); container.remove(); };
  const byText = (text) => [...container.querySelectorAll('button')]
    .find((b) => b.textContent.trim() === text);
  return {
    container,
    unmount,
    async setMode(value) {
      const sel = container.querySelector('select');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      await act(async () => {
        setter.call(sel, value);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
    },
    async press(label) {
      const b = byText(label) ?? [...container.querySelectorAll('button')]
        .find((x) => x.textContent.includes(label));
      if (!b) throw new Error(`no button matching ${label}`);
      await act(async () => { b.click(); });
    },
    text: () => container.textContent,
    panel: () => container.querySelector('.unc-panel')?.textContent ?? '',
    /*
     * The contribution rows only, not the whole panel.
     *
     * The intro legitimately *names* the cell in absorbance mode — to say it
     * plays no part — so searching the panel text for the word finds it either
     * way and asserts nothing.
     */
    contributions: () => [...container.querySelectorAll('.unc-contrib dt')].map((d) => d.textContent),
    result: () => container.querySelector('.result')?.textContent ?? '',
  };
}

/** The relative uncertainty the panel reports, as a number in percent. */
function panelRelative(panelText) {
  const m = panelText.match(/([\d.]+)%/);
  return m ? Number(m[1]) : null;
}

describe('SpectroTab uncertainty budget', () => {
  it('should mount without the shared panel frame crashing on a missing flask', async () => {
    // The panel's volumetric rows are guarded now. Unguarded, this mount threw
    // "Cannot read properties of undefined (reading 'value')" and React tore
    // the whole tab down.
    const tab = await mountTab();
    await tab.press('计算');
    await tab.press('算不确定度');
    expect(logged.join('\n')).not.toMatch(/UncertaintyPanel|reading 'value'/);
    expect(tab.panel()).toContain('%');
    await tab.unmount();
  });

  it('should report the same relative uncertainty in the panel as on the result', async () => {
    // Two renderings of one measurement disagreeing is the defect the panel was
    // extracted to stop, and the spectro tab reproduced it across the two
    // directions before the budget was split.
    const tab = await mountTab();
    await tab.press('计算');
    await tab.press('算不确定度');
    const shown = tab.result().match(/相对\s*([\d.]+)%/);
    expect(shown).not.toBeNull();
    expect(panelRelative(tab.panel())).toBeCloseTo(Number(shown[1]), 6);
    await tab.unmount();
  });

  it('should leave the cell out of an absorbance result', async () => {
    // Given c and l, A is computed from a path that is a known input. A
    // tolerance on it cannot move the answer, so claiming a contribution would
    // be claiming an uncertainty that is not there.
    const tab = await mountTab();
    await tab.press('计算');
    await tab.press('算不确定度');
    expect(tab.contributions()).not.toContain('比色皿光程');
    // And the caveat must not claim the cell was counted when it was not.
    expect(tab.panel()).not.toContain('只算了光度计和比色皿');
    await tab.unmount();
  });

  it('should include the cell when the path divides into the answer', async () => {
    // c = A/(ε·l): here the path is a divisor, so its tolerance propagates.
    const tab = await mountTab();
    await tab.setMode('concentration');
    await tab.press('计算');
    await tab.press('算不确定度');
    expect(tab.contributions()).toContain('比色皿光程');
    await tab.unmount();
  });

  it('should give the concentration more uncertainty than the absorbance it came from', async () => {
    // The cell adds a term that absorbance mode does not have, so the
    // concentration cannot be better determined than the reading behind it.
    const abs = await mountTab();
    await abs.press('计算');
    await abs.press('算不确定度');
    const absRel = panelRelative(abs.panel());
    await abs.unmount();

    const conc = await mountTab();
    await conc.setMode('concentration');
    await conc.press('计算');
    await conc.press('算不确定度');
    const concRel = panelRelative(conc.panel());
    await conc.unmount();

    expect(concRel).toBeGreaterThan(absRel);
  });

  it('should hide the path tolerance field where it changes nothing', async () => {
    // A field the user can adjust with no movement in the number below it
    // teaches them the panel is broken. The fields only exist once the panel is
    // open, so it has to be opened before looking.
    const tab = await mountTab();
    await tab.press('算不确定度');
    expect(tab.text()).not.toContain('光程允差');
    await tab.setMode('concentration');
    expect(tab.text()).toContain('光程允差');
    await tab.unmount();
  });

  it('should not offer a budget in curve mode', async () => {
    // A standard curve is a regression; its budget is the slope's standard
    // error, which the result block already reports. A photometer budget there
    // would be two answers to one question.
    const tab = await mountTab();
    await tab.setMode('curve');
    expect(tab.text()).not.toContain('算不确定度');
    await tab.unmount();
  });
});
