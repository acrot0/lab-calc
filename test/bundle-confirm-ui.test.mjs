// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../src/ui/LocaleContext.jsx';
import HistoryPanel from '../src/ui/components/HistoryPanel.jsx';
import { memoryStore, visibleEntries, deletedEntries } from '../src/ui/history.mjs';
import { toBundle } from '../src/ui/export.mjs';

/*
 * The JSON backup's confirmation, through the component.
 *
 * `bundle-preview.test.mjs` holds the numbers. What it cannot see is the
 * wiring, and the wiring is where this feature is easy to get wrong in a way
 * that passes every module test: the menu item calling `doExport` directly
 * instead of `openPreview`, the confirmation rendering the table shape for a
 * file that has no rows, or the count coming from the filtered list rather than
 * from the archive.
 *
 * That last one is the specific trap. Every other export is previewed from
 * `exportRows` — the records currently *visible*, after the search and the
 * group filter. The bundle is the archive: deleted records included, filters
 * ignored. A confirmation driven by the visible list would understate the file
 * and, worse, would do so precisely when the user has a search active — the
 * moment they are most likely to be checking.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__APP_VERSION__ = '0.0.0-test';

const roots = [];
function makeRoot(container) {
  const root = createRoot(container);
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const r of roots.splice(0)) {
    try { r.unmount(); } catch { /* already gone */ }
  }
  document.body.innerHTML = '';
});

const live = (n, from = 0) => Array.from({ length: n }, (_, i) => ({
  id: `L${from + i}`,
  at: `2026-09-29T0${(i % 9) + 1}:00:00.000Z`,
  kind: 'dilution',
  summary: `稀释 ${from + i}`,
  inputs: { c1: 1, v1: 1, c2: 1, v2: 1 },
  outputs: { v2: 1 },
}));
const dead = (n) => Array.from({ length: n }, (_, i) => ({
  id: `D${i}`,
  at: '2026-09-01T00:00:00.000Z',
  kind: 'dilution',
  summary: `已删 ${i}`,
  inputs: { c1: 1, v1: 1, c2: 1, v2: 1 },
  deletedAt: '2026-09-20T00:00:00.000Z',
}));

async function mount(list) {
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
          onRemove: () => {},
          onRestore: () => {},
          onReplay: () => {},
          onClear: () => {},
          onImport: () => {},
          onMeta: () => {},
        })),
    );
  });
  return container;
}

/** Open the export menu and click the JSON item. */
async function openBundlePreview() {
  const menuButton = [...document.querySelectorAll('button')]
    .find((b) => /导出|Export/.test(b.textContent ?? '') && b.getAttribute('aria-haspopup') === 'menu');
  expect(menuButton, 'the export menu button').toBeTruthy();
  await act(async () => { menuButton.click(); });
  const item = [...document.querySelectorAll('[role="menuitem"]')]
    .find((b) => /JSON|备份|backup/i.test(b.textContent ?? ''));
  expect(item, 'the JSON menu item').toBeTruthy();
  await act(async () => { item.click(); });
}

describe('the bundle confirmation', () => {
  it('should open a confirmation rather than exporting straight away', async () => {
    // The defect this replaces: the backup fired from the menu with nothing
    // said, and it is the one export that can restore a history.
    await mount([...live(5), ...dead(2)]);
    await openBundlePreview();
    expect(document.querySelector('.export-preview')).not.toBeNull();
  });

  it('should count the archive, not the visible list', async () => {
    // 10 in the file, 3 deleted. The visible list is 7 — a confirmation driven
    // by `exportRows` would say 7 and the file would carry 10.
    await mount([...live(7), ...dead(3)]);
    await openBundlePreview();
    const text = document.querySelector('.export-preview').textContent;
    expect(text).toMatch(/10|十/);
  });

  it('should name how many deleted records it carries', async () => {
    // "Export, clear, re-import" only works because they are in there, and the
    // user has no other way to know.
    await mount([...live(4), ...dead(3)]);
    await openBundlePreview();
    const text = document.querySelector('.export-preview').textContent;
    expect(text).toMatch(/3|三/);
    expect(text).toMatch(/删除|deleted/i);
  });

  it('should report a file size', async () => {
    await mount(live(20));
    await openBundlePreview();
    const text = document.querySelector('.export-preview').textContent;
    expect(text).toMatch(/\d+(\.\d+)?\s?(B|KB|MB|GB)/);
  });

  it('should not render a table for a file that has no rows', async () => {
    /*
     * The reason the bundle is excluded from the table preview. Its shape is
     * not tabular, and three rows of a complete archive read as "this file is
     * small" — the opposite of what someone about to trust it needs.
     */
    await mount([...live(30), ...dead(5)]);
    await openBundlePreview();
    expect(document.querySelector('.export-preview-table')).toBeNull();
    expect(document.querySelector('.export-preview-cols')).toBeNull();
    // The facts list is what replaced them.
    expect(document.querySelector('.export-preview-facts')).not.toBeNull();
  });

  it('should say the file can be restored', async () => {
    // The one sentence that matters more than the numbers: this is not a
    // report, it is the thing you get your history back from.
    await mount(live(2));
    await openBundlePreview();
    const text = document.querySelector('.export-preview').textContent;
    expect(text).toMatch(/还原|恢复|导入|restore|import/i);
  });

  it('should offer confirm and cancel, and cancel should close it', async () => {
    await mount(live(2));
    await openBundlePreview();
    const cancel = [...document.querySelectorAll('.export-preview button')]
      .find((b) => /取消|Cancel/i.test(b.textContent ?? ''));
    expect(cancel).toBeTruthy();
    await act(async () => { cancel.click(); });
    expect(document.querySelector('.export-preview')).toBeNull();
  });

  it('should agree with the file the writer produces', async () => {
    // The property that makes a confirmation worth having. The number shown is
    // the number of entries `toBundle` is handed.
    const list = [...live(6), ...dead(2)];
    await mount(list);
    await openBundlePreview();
    const text = document.querySelector('.export-preview').textContent;
    const parsed = JSON.parse(toBundle(list));
    expect(parsed.entries).toHaveLength(8);
    expect(text).toMatch(/8/);
  });
});

describe('the other formats still preview as tables', () => {
  it('should render columns and rows for CSV', async () => {
    // The bundle's different shape must not have replaced the table for the
    // formats that are genuinely tabular.
    await mount(live(5));
    const menuButton = [...document.querySelectorAll('button')]
      .find((b) => /导出|Export/.test(b.textContent ?? '') && b.getAttribute('aria-haspopup') === 'menu');
    await act(async () => { menuButton.click(); });
    const csv = [...document.querySelectorAll('[role="menuitem"]')]
      .find((b) => /CSV/i.test(b.textContent ?? ''));
    await act(async () => { csv.click(); });
    expect(document.querySelector('.export-preview-cols')).not.toBeNull();
    expect(document.querySelector('.export-preview-facts')).toBeNull();
  });
});
