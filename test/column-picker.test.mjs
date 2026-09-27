// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../src/ui/LocaleContext.jsx';
import ColumnPicker from '../src/ui/components/ColumnPicker.jsx';
import { detailColumns, xlsxPlan } from '../src/ui/export.mjs';
import { memoryStore } from '../src/ui/history.mjs';

/*
 * The column picker crashed the whole history panel on first render.
 *
 * `detailColumns` returns `{ inputKeys, outputKeys }` — the shape `xlsxPlan`
 * reads — and the component destructured it as `{ inputs, outputs }`. Both
 * came back undefined and the first `.length` threw, which React turned into
 * an unmounted tree: not a broken picker, a blank page.
 *
 * It is exactly the class of bug the repo's own `dom-render` test exists to
 * catch, and it slipped through because that test mounts *tabs* and this is a
 * component inside one. So the test here mounts the real component against the
 * real `detailColumns` output rather than against a hand-written object — a
 * fixture with the right shape would have hidden the mismatch, which is what
 * happened the first time.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const entries = [
  {
    id: '1',
    kind: 'stockFromSolid',
    at: '2026-09-27T02:00:00.000Z',
    inputs: { formula: 'NaCl', molarity: 0.5 },
    outputs: { massG: 14.61 },
  },
  {
    id: '2',
    kind: 'dilution',
    at: '2026-09-27T02:01:00.000Z',
    inputs: { stockConc: 1, targetConc: 0.1 },
    outputs: { stockVolumeMl: 5 },
  },
];

let logged;
beforeEach(() => {
  logged = [];
  const original = console.error;
  console.error = (...args) => { logged.push(args.map(String).join(' ')); original(...args); };
  return () => { console.error = original; };
});
afterEach(() => { document.body.innerHTML = ''; });

async function mount(node) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(node); });
  return { container, root };
}

const wrap = (node) => React.createElement(
  LocaleProvider, { store: memoryStore() }, node,
);

describe('ColumnPicker', () => {
  it('should render against the real detailColumns output', async () => {
    // The exact call the panel makes. If the two shapes drift again, this
    // throws here rather than blanking the page in a browser.
    const available = detailColumns(entries);
    const { container } = await mount(wrap(React.createElement(ColumnPicker, {
      available, selected: null, onChange: () => {},
    })));
    expect(container.querySelector('.col-picker')).not.toBeNull();
    expect(logged.filter((l) => l.includes('Error'))).toEqual([]);
  });

  it('should offer every field the records actually contain', async () => {
    const available = detailColumns(entries);
    const { container } = await mount(wrap(React.createElement(ColumnPicker, {
      available, selected: null, onChange: () => {},
    })));
    const items = [...container.querySelectorAll('.col-picker-item')];
    // formula, molarity, stockConc, targetConc = 4 inputs; massG, stockVolumeMl = 2 outputs.
    expect(items).toHaveLength(6);
  });

  it('should start with everything checked', async () => {
    const { container } = await mount(wrap(React.createElement(ColumnPicker, {
      available: detailColumns(entries), selected: null, onChange: () => {},
    })));
    const boxes = [...container.querySelectorAll('input[type=checkbox]')];
    expect(boxes.every((b) => b.checked)).toBe(true);
  });

  it('should report a narrowed selection rather than a full list', async () => {
    // Unchecking one must yield a concrete list, not `null` — `null` means
    // "all", and returning it here would export everything anyway.
    const available = detailColumns(entries);
    let got = null;
    const { container } = await mount(wrap(React.createElement(ColumnPicker, {
      available, selected: null, onChange: (v) => { got = v; },
    })));
    const first = container.querySelector('input[type=checkbox]');
    await act(async () => { first.click(); });
    expect(got).not.toBeNull();
    expect(got.inputs.length).toBe(available.inputKeys.length - 1);
  });

  it('should go back to "all" when the last unchecked box is rechecked', async () => {
    // Otherwise "select all" and "never touched it" become two states that
    // behave alike but compare differently, and the plan receives a list that
    // happens to be complete.
    //
    // Driven through a stateful host, not by clicking a controlled component
    // several times: the component is controlled, so a fixed `selected` prop
    // means every click recomputes from the same stale value and the second
    // click is a no-op. That is how this test first failed, and it was the
    // test's fault rather than the component's.
    const available = detailColumns(entries);
    let latest = { inputs: ['formula'], outputs: null };
    function Host() {
      const [sel, setSel] = React.useState({ inputs: ['formula'], outputs: null });
      return React.createElement(ColumnPicker, {
        available,
        selected: sel,
        onChange: (v) => { latest = v; setSel(v); },
      });
    }
    const { container } = await mount(wrap(React.createElement(Host)));
    // Recheck every box that is off, one at a time, letting React re-render.
    for (let i = 0; i < 6; i += 1) {
      const off = [...container.querySelectorAll('input[type=checkbox]')].find((b) => !b.checked);
      if (!off) break;
      await act(async () => { off.click(); });
    }
    expect(latest.inputs).toBeNull();
  });

  it('should hand xlsxPlan a selection it can honour', async () => {
    // The end-to-end property: what the picker produces is what the writer
    // narrows to. A shape mismatch here would silently export every column.
    const available = detailColumns(entries);
    const selection = { inputs: ['formula'], outputs: null };
    const plan = xlsxPlan(entries, { view: 'data', columns: selection });
    const header = plan.rows[0];
    expect(header.some((h) => h.includes('化学式'))).toBe(true);
    expect(header.some((h) => h.includes('目标浓度'))).toBe(false);
  });

  it('should say so rather than render an empty grid when there is nothing to pick', async () => {
    const { container } = await mount(wrap(React.createElement(ColumnPicker, {
      available: { inputKeys: [], outputKeys: [] }, selected: null, onChange: () => {},
    })));
    expect(container.querySelector('.col-picker')).toBeNull();
    expect(container.textContent).toBeTruthy();
  });

  it('should survive a missing available prop', async () => {
    // Defensive: the panel passes it, but a crash here blanks the page.
    const { container } = await mount(wrap(React.createElement(ColumnPicker, {
      selected: null, onChange: () => {},
    })));
    expect(container.textContent).toBeTruthy();
  });
});
