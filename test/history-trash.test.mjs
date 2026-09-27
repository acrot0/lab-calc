// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../src/ui/LocaleContext.jsx';
import HistoryPanel from '../src/ui/components/HistoryPanel.jsx';
import { memoryStore, removeEntry, visibleEntries, deletedEntries } from '../src/ui/history.mjs';

/*
 * The restore affordance, tested through the component rather than the module.
 *
 * `history.mjs` already has the marking covered. What can still be wrong — and
 * was, in the first pass — is the wiring: the panel reading the raw list, so a
 * deleted record stays on screen, or the trash section never rendering so the
 * mark is unreachable. Both are invisible to a module-level test.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let logged;
beforeEach(() => {
  logged = [];
  const original = console.error;
  console.error = (...args) => { logged.push(args.map(String).join(' ')); original(...args); };
});
afterEach(() => { document.body.innerHTML = ''; });

const entry = (id) => ({
  id,
  at: '2026-09-27T10:00:00.000Z',
  kind: 'dilution',
  inputs: { c1: 1, v1: 1, c2: 1, v2: 1 },
});

async function mount(list, handlers = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(LocaleProvider, { store: memoryStore() },
        React.createElement(HistoryPanel, {
          entries: visibleEntries(list),
          allEntries: list,
          deleted: deletedEntries(list),
          onRemove: handlers.onRemove ?? (() => {}),
          onRestore: handlers.onRestore ?? (() => {}),
          onReplay: () => {},
          onClear: () => {},
          onImport: () => {},
          onMeta: () => {},
        })),
    );
  });
  return container;
}

const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const byLabel = (container, re) => [...container.querySelectorAll('[aria-label]')]
  .filter((el) => re.test(el.getAttribute('aria-label')));

describe('HistoryPanel deleted records', () => {
  it('should not list a deleted record', async () => {
    const list = removeEntry([entry('a'), entry('b')], 'a');
    const c = await mount(list);
    expect(byLabel(c, /载入|Reload/)).toHaveLength(1);
  });

  it('should offer a way into the deleted records', async () => {
    const list = removeEntry([entry('a'), entry('b')], 'a');
    const c = await mount(list);
    expect(c.textContent).toMatch(/已删除 1 条|1 deleted/);
  });

  it('should call onRestore with the id when the restore button is clicked', async () => {
    const onRestore = vi.fn();
    const list = removeEntry([entry('a'), entry('b')], 'a');
    const c = await mount(list, { onRestore });
    const toggle = [...c.querySelectorAll('button')].find((b) => /已删除|deleted/.test(b.textContent));
    await click(toggle);
    await click(byLabel(c, /恢复|Restore/)[0]);
    expect(onRestore).toHaveBeenCalledWith('a');
  });

  it('should render no trash section when nothing is deleted', async () => {
    const c = await mount([entry('a')]);
    expect(c.textContent).not.toMatch(/已删除|deleted/);
  });

  it('should keep deleted records out of the list when handed the raw list', async () => {
    // `filterHistory` returns its input untouched for an empty query, so a
    // panel that did not filter would show every deleted record — the
    // regression that makes the whole feature cosmetic.
    const all = removeEntry([entry('a'), entry('b'), entry('c')], 'b');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(LocaleProvider, { store: memoryStore() },
          React.createElement(HistoryPanel, {
            entries: all,
            onRemove: () => {}, onRestore: () => {}, onReplay: () => {},
            onClear: () => {}, onImport: () => {}, onMeta: () => {},
          })),
      );
    });
    expect(byLabel(container, /载入|Reload/)).toHaveLength(2);
  });
});

/*
 * The regression guard for the Suspense defect found while writing the tests
 * above.
 *
 * `Report` is loaded with `lazy()` and rendered into a portal with no boundary
 * above it. React bubbles a suspended child to the nearest boundary, and with
 * none present the whole app unmounts to its fallback — on a cold load, a blank
 * page. It was invisible in the browser (the chunk arrives in milliseconds on
 * localhost) and invisible to every existing test (none of them mount this
 * panel). It showed up here as an empty container with nothing logged.
 *
 * Behavioural rather than a source-text check: this asserts what the user sees.
 * Removing the boundary makes it fail; the regex version would have passed on a
 * boundary in the wrong place.
 */
describe('the panel renders its own content', () => {
  it('should not suspend the tree while the print report loads', async () => {
    const list = [entry('a')];
    const c = await mount(list);
    expect(c.innerHTML.length).toBeGreaterThan(0);
    expect(byLabel(c, /载入|Reload/).length).toBeGreaterThan(0);
    expect(logged).toEqual([]);
  });
});

/*
 * The clear-all call site.
 *
 * `clearHistory()` has an `entries = []` default, so calling it with no
 * argument returns an empty array — which wiped every tombstone along with the
 * live records. The module's own tests passed the list in and were green; the
 * browser was not, and the records were gone. That gap is what this covers: the
 * handler has to thread the current list through.
 *
 * Mounting the whole App is what makes it a call-site test — and the app reads
 * `localStorage` directly (`resolveStore()` with no argument), so seeding a
 * private store would test nothing. Anything narrower rebuilds the mistake it
 * is meant to catch.
 */
describe('clear all marks rather than erases', () => {
  it('should keep the records in storage after clearing', async () => {
    const { default: App } = await import('../src/ui/App.jsx');
    const { ThemeProvider } = await import('../src/ui/ThemeContext.jsx');
    const { MaterialProvider } = await import('../src/ui/MaterialContext.jsx');
    const { STORAGE_KEY } = await import('../src/ui/history.mjs');

    globalThis.localStorage.clear();
    globalThis.localStorage.setItem('lab-calc.disclaimer-ack.v1', '1');
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { id: 'a', at: '2026-09-27T10:00:00.000Z', kind: 'dilution', inputs: { c1: 1, v1: 1, c2: 1, v2: 1 } },
      { id: 'b', at: '2026-09-27T10:01:00.000Z', kind: 'dilution', inputs: { c1: 2, v1: 1, c2: 1, v2: 1 } },
    ]));

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(LocaleProvider, { store: null },
        React.createElement(ThemeProvider, { store: null },
          React.createElement(MaterialProvider, { store: null },
            React.createElement(App)))));
    });

    const clearBtn = [...container.querySelectorAll('button')]
      .find((b) => /全部清除|Clear all/.test(b.textContent));
    expect(clearBtn, `no clear button; buttons=${[...container.querySelectorAll('button')].map((b) => b.textContent).join('|')}`).toBeTruthy();
    await click(clearBtn);

    const raw = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY));
    expect(raw).toHaveLength(2);
    expect(raw.every((e) => e.deletedAt)).toBe(true);
  }, 30000);
});

/*
 * The backup has to carry the deleted records.
 *
 * A tombstone that does not survive "export a backup, wipe the machine, import
 * it back" is not an archive — it is a flag on the machine that happened to
 * make it. `parseBundle` keeps any object with a string `kind`, so the extra
 * field rides through; what this pins is that nothing downstream strips it.
 */
describe('deleted records survive a backup round trip', () => {
  it('should keep deletedAt through exportBundle and parseBundle', async () => {
    const { toBundle, parseBundle } = await import('../src/ui/export.mjs');
    const marked = removeEntry(
      [{ id: 'a', at: '2026-09-27T10:00:00.000Z', kind: 'dilution', inputs: { c1: 1 } },
        { id: 'b', at: '2026-09-27T10:01:00.000Z', kind: 'dilution', inputs: { c1: 2 } }],
      'a',
    );
    const back = parseBundle(toBundle(marked));
    expect(back.ok).toBe(true);
    expect(back.entries).toHaveLength(2);
    const a = back.entries.find((e) => e.id === 'a');
    expect(a.deletedAt).toBeTruthy();
    // And it is still hidden after the import, not resurrected.
    expect(visibleEntries(back.entries).map((e) => e.id)).toEqual(['b']);
    expect(deletedEntries(back.entries).map((e) => e.id)).toEqual(['a']);
  });
});
