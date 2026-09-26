// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../src/ui/LocaleContext.jsx';

/*
 * Every warning branch of the four newer tabs, forced and inspected.
 *
 * Each case drives a tab into a state that should raise a warning or an error
 * and then reads the rendered text. Two things are checked that no other test
 * covers: that a bad token (`undefined`, `NaN`, `[object Object]`) never
 * reaches the screen, and that no unresolved `{placeholder}` survives — the
 * latter being how a raw i18n key or a missing param actually looks.
 *
 * The cases are the adversarial inputs, not the happy path: identical
 * replicates, zero spread, a slope of zero, alpha at 1, no eutectic, a
 * confidence of 150. Those are the inputs where a branch is skipped and a
 * value is read off a field that was never set.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function stubCanvas() {
  const ctx = new Proxy({}, { get() { return () => {}; }, set() { return true; } });
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext() { return ctx; };
  return { restore: () => { HTMLCanvasElement.prototype.getContext = original; } };
}

const findings = [];
let casesRun = 0;

async function mount(node) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(node); });
  return { container, unmount: async () => { await act(async () => { root.unmount(); }); container.remove(); } };
}

function nativeSet(el, value) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
}

async function setSelect(container, value) {
  const sel = container.querySelector('select');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function setField(container, idx, value) {
  const els = [...container.querySelectorAll('input[type="text"], textarea')];
  const el = els[idx];
  if (!el) { findings.push(`no field #${idx} to fill`); return; }
  await act(async () => { nativeSet(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
}

async function clickCalc(container) {
  const b = container.querySelector('button.primary')
    || [...container.querySelectorAll('button')].find((x) => /计算|Calculate|检验|Run/.test(x.textContent));
  if (!b) return; // uncertainty/molarMass is live, no button by design
  await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

const wrap = (C) => React.createElement(LocaleProvider, { store: null },
  React.createElement(C, { onRecord: () => {}, restored: null, theme: 'dark' }));

const BAD_TOKENS = ['undefined', 'NaN', 'Infinity', '[object'];

function scan(label, container) {
  const text = container.textContent;
  const bad = BAD_TOKENS.filter((tok) => text.includes(tok));
  const ph = [...new Set([...text.matchAll(/\{[a-zA-Z]\w*\}/g)].map((m) => m[0]))];
  if (bad.length || ph.length) {
    const msgs = [...container.querySelectorAll('.msg, .hint, .result-note')]
      .map((n) => n.textContent.trim()).join(' | ');
    findings.push(`${label}  bad=${JSON.stringify(bad)} ph=${JSON.stringify(ph)}  ${msgs.slice(0, 200)}`);
  }
}

// Each case: tab, mode, list of [fieldIndex, value] edits, label
const CASES = [
  ['uncertainty', 'molarMass', [[0, 'Xx2O3']], 'unknown element'],
  ['uncertainty', 'molarMass', [[0, '']], 'empty formula'],
  ['uncertainty', 'propagate', [[0, 'a, 1, 0.1, @p\nb, 2, 0.2, @p']], 'correlated groups'],
  ['uncertainty', 'propagate', [[0, 'a, 1, 0.1\nb, 2, 0.2']], 'independent'],
  ['uncertainty', 'propagate', [[0, 'x']], 'bad line'],
  ['uncertainty', 'weigh', [[4, '0']], 'zero volume unc'],
  ['analytical', 'edta', [[0, '5']], 'pH 5 not sharp'],
  ['analytical', 'edta', [[0, '13']], 'pH 13 too high'],
  ['analytical', 'edta', [[0, '0']], 'pH 0'],
  ['analytical', 'redox', [[1, '1']], 'n1=1'],
  ['analytical', 'redox', [[0, '0']], 'E1=0'],
  ['analytical', 'gravimetric', [[1, '1']], 'count 1'],
  ['analytical', 'gravimetric', [[0, 'Xx']], 'bad sought'],
  ['analytical', 'recovery', [[0, '100, 100, 100']], 'identical recoveries'],
  ['analytical', 'recovery', [[0, 'x']], 'bad recovery'],
  ['analytical', 'lod', [[0, '0, 0, 0, 0, 0, 0, 0']], 'zero spread'],
  ['analytical', 'lod', [[0, '0.1, 0.2']], 'few blanks'],
  ['analytical', 'lod', [[2, '']], 'no slope SE'],
  ['analytical', 'chromatography', [[1, '5.1']], 'unresolved'],
  ['analytical', 'chromatography', [[1, '5.0']], 'same retention'],
  ['physical', 'kinetics', [[0, '0, 1\n10, 1\n20, 1']], 'flat data'],
  ['physical', 'kinetics', [[0, '0, 1\n10, 0.5']], 'too few points'],
  ['physical', 'kinetics', [[1, '10000']], 'exhausted'],
  ['physical', 'arrhenius', [[0, '20, 0.001\n21, 0.0011\n22, 0.0012']], 'narrow range'],
  ['physical', 'arrhenius', [[0, '20, 0.001\n30, 0.002']], 'two points'],
  ['physical', 'conductivity', [[0, '2000']], 'alpha > 1'],
  ['physical', 'conductivity', [[2, '390.7']], 'alpha = 1'],
  ['physical', 'thermo', [[0, '50'], [1, '100']], 'no crossover'],
  ['physical', 'thermo', [[1, '0']], 'dS = 0'],
  ['physical', 'phase', [[0, '80.2, 19.0'], [1, '79.0, 18.0']], 'similar comps no eutectic'],
  ['physical', 'phase', [[0, 'x']], 'bad component'],
  ['stats', null, [[0, '5, 5, 5'], [1, '6, 6, 6']], 'constant samples'],
  ['stats', null, [[0, '5, 5, 5'], [1, '5, 5, 5']], 'identical constant'],
  ['stats', null, [[2, '0']], 'confidence 0'],
  ['stats', null, [[2, '150']], 'confidence 150'],
  ['stats', null, [[0, 'x, y']], 'bad numbers'],
];

const TABS = {
  uncertainty: () => import('../src/ui/tabs/UncertaintyTab.jsx'),
  stats: () => import('../src/ui/tabs/StatsTab.jsx'),
  analytical: () => import('../src/ui/tabs/AnalyticalTab.jsx'),
  physical: () => import('../src/ui/tabs/PhysicalTab.jsx'),
};

describe('tab warning branches', () => {
  it('should render no bad token or unresolved placeholder in any of them', async () => {
    const canvas = stubCanvas();
    try {
      for (const [name, mode, edits, label] of CASES) {
        const { default: C } = await (TABS[name])();
        const { container, unmount } = await mount(wrap(C));
        const where = `${name}/${mode ?? '-'} [${label}]`;
        try {
          if (mode !== null) await setSelect(container, mode);
          for (const [idx, val] of edits) await setField(container, idx, val);
          scan(`${where} before`, container);
          await clickCalc(container);
          scan(where, container);
          casesRun += 1;
        } catch (e) {
          findings.push(`${where} threw: ${e.message}`);
        }
        await unmount();
      }
    } finally { canvas.restore(); }

    // A sweep that silently stopped driving the tabs would otherwise pass by
    // finding nothing, which is the failure mode this guard exists for.
    expect(casesRun, 'no case reached the point of being scanned').toBeGreaterThan(30);
    expect(findings, `bad output reached the screen:\n${findings.join('\n')}`).toEqual([]);
  }, 180000);
});
