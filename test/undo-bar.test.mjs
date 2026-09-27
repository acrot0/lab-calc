// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../src/ui/LocaleContext.jsx';
import HistoryPanel from '../src/ui/components/HistoryPanel.jsx';
import { memoryStore, removeEntry, clearHistory, visibleEntries, deletedEntries } from '../src/ui/history.mjs';
import { UNDO_MS } from '../src/ui/use-undo.mjs';

/*
 * The undo bar, wired into the panel.
 *
 * `use-undo.test.mjs` covers the countdown itself. What this covers is the part
 * that a hook test cannot see: whether the panel offers the undo at all, whether
 * the number in the message is the number that disappeared, and whether pressing
 * the button actually restores what the action removed.
 *
 * The complaint being answered was 「误触会导致全部记录清空」. The records were
 * never destroyed — they were marked and the trash could return them — so the
 * defect was entirely in this layer: the recovery existed and was invisible.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const roots = [];
function makeRoot(container) {
  const root = createRoot(container);
  roots.push(root);
  return root;
}

let logged;
beforeEach(() => {
  vi.useFakeTimers();
  logged = [];
  const original = console.error;
  console.error = (...args) => { logged.push(args.map(String).join(' ')); original(...args); };
});
afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.innerHTML = '';
  console.error = vi.fn();
  vi.useRealTimers();
});

const entry = (id) => ({
  id,
  at: '2026-09-27T10:00:00.000Z',
  kind: 'dilution',
  inputs: { c1: 1, v1: 1, c2: 1, v2: 1 },
});

async function mount(list, handlers = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = makeRoot(container);
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
          onClear: handlers.onClear ?? (() => {}),
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
const findButton = (container, re) => [...container.querySelectorAll('button')]
  .find((b) => re.test(b.textContent));

describe('HistoryPanel undo bar', () => {
  it('should show no bar before anything is deleted', async () => {
    const c = await mount([entry('a')]);
    expect(c.querySelector('.undo-bar')).toBeNull();
    expect(logged).toEqual([]);
  });

  it('should offer an undo after a single record is deleted', async () => {
    const c = await mount([entry('a'), entry('b')], { onRemove: () => {} });
    await click(byLabel(c, /删除这条记录|Delete this entry/)[0]);
    const bar = c.querySelector('.undo-bar');
    expect(bar).not.toBeNull();
    expect(bar.textContent).toMatch(/撤销|Undo/);
  });

  it('should restore the record the undo button refers to', async () => {
    // The whole point. A bar that appears and undoes the wrong thing — or
    // nothing — is worse than no bar, because it teaches the user to trust it.
    const onRestore = vi.fn();
    const c = await mount([entry('a'), entry('b')], { onRemove: () => {}, onRestore });
    await click(byLabel(c, /删除这条记录|Delete this entry/)[0]);
    await click(findButton(c.querySelector('.undo-bar'), /撤销|Undo/));
    expect(onRestore).toHaveBeenCalledWith('a');
  });

  it('should dismiss the bar once the undo has run', async () => {
    const c = await mount([entry('a')], { onRemove: () => {}, onRestore: () => {} });
    await click(byLabel(c, /删除这条记录|Delete this entry/)[0]);
    await click(findButton(c.querySelector('.undo-bar'), /撤销|Undo/));
    expect(c.querySelector('.undo-bar')).toBeNull();
  });

  it('should name how many records a clear-all removed', async () => {
    // The count is read before the clear, because the clear is what makes it
    // unreadable. A message reading "cleared 0 records" after clearing three is
    // the failure this catches.
    const c = await mount([entry('a'), entry('b'), entry('c')], { onClear: () => {} });
    await click(findButton(c, /全部清除|Clear all/));
    expect(c.querySelector('.undo-bar').textContent).toMatch(/3/);
  });

  it('should restore every record a clear-all removed', async () => {
    // Bulk, because clearing was bulk. Restoring only the first would look like
    // a partial undo, which reads as data loss.
    const onRestore = vi.fn();
    const c = await mount([entry('a'), entry('b'), entry('c')], { onClear: () => {}, onRestore });
    await click(findButton(c, /全部清除|Clear all/));
    await click(findButton(c.querySelector('.undo-bar'), /撤销|Undo/));
    expect(onRestore.mock.calls.map(([id]) => id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('should not offer to restore a record that was already in the trash', async () => {
    // Clearing only touches the live records. Undoing it must restore exactly
    // those — a record deleted a minute earlier, before the clear, would have
    // to stay gone or "undo the clear" would quietly undo something else too.
    const onRestore = vi.fn();
    const list = removeEntry([entry('a'), entry('b')], 'a');
    const c = await mount(list, { onClear: () => {}, onRestore });
    await click(findButton(c, /全部清除|Clear all/));
    await click(findButton(c.querySelector('.undo-bar'), /撤销|Undo/));
    expect(onRestore.mock.calls.map(([id]) => id)).toEqual(['b']);
  });

  it('should drop the bar when the countdown expires', async () => {
    const c = await mount([entry('a')], { onRemove: () => {} });
    await click(byLabel(c, /删除这条记录|Delete this entry/)[0]);
    expect(c.querySelector('.undo-bar')).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(UNDO_MS); });
    expect(c.querySelector('.undo-bar')).toBeNull();
  });

  it('should not undo anything when the bar is dismissed by hand', async () => {
    const onRestore = vi.fn();
    const c = await mount([entry('a')], { onRemove: () => {}, onRestore });
    await click(byLabel(c, /删除这条记录|Delete this entry/)[0]);
    await click(byLabel(c.querySelector('.undo-bar'), /关闭提示|Dismiss/)[0]);
    expect(onRestore).not.toHaveBeenCalled();
    expect(c.querySelector('.undo-bar')).toBeNull();
  });

  it('should keep the trash section as the durable undo', async () => {
    // The bar is the immediate way back, not the only one. If it ever replaced
    // the trash rather than sitting beside it, a user who missed the eight
    // seconds would be left with no route at all.
    const list = removeEntry([entry('a'), entry('b')], 'a');
    const c = await mount(list);
    await act(async () => { vi.advanceTimersByTime(UNDO_MS * 2); });
    expect(c.textContent).toMatch(/已删除 1 条|1 deleted/);
  });

  it('should not log an error while the bar counts down', async () => {
    // The suite's own rule: a React warning about an unmounted update or a
    // missing key is a failure here, not noise.
    const c = await mount([entry('a')], { onRemove: () => {} });
    await click(byLabel(c, /删除这条记录|Delete this entry/)[0]);
    await act(async () => { vi.advanceTimersByTime(UNDO_MS); });
    expect(logged).toEqual([]);
  });
});

describe('clearHistory + undo round trip', () => {
  it('should bring back the exact list a clear removed', async () => {
    // The module-level half: the undo path goes through `restoreEntry`, and the
    // two have to compose back to the original list or the panel's undo would
    // restore something subtly different from what was there.
    const before = [entry('a'), entry('b')];
    const cleared = clearHistory(before, new Date('2026-09-27T12:00:00.000Z'));
    expect(visibleEntries(cleared)).toHaveLength(0);

    const restored = cleared.reduce(
      (list, e) => (e.deletedAt ? list.map((x) => (x.id === e.id ? { ...x, deletedAt: undefined } : x)) : list),
      cleared,
    );
    const clean = restored.map(({ deletedAt: _drop, ...rest }) => rest);
    expect(clean.map((e) => e.id)).toEqual(before.map((e) => e.id));
  });
});
