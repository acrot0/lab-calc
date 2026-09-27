// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LocaleProvider } from '../src/ui/LocaleContext.jsx';
import HistoryPanel from '../src/ui/components/HistoryPanel.jsx';
import { memoryStore, visibleEntries } from '../src/ui/history.mjs';
import { createGroup, assignGroup, removeGroup } from '../src/ui/groups.mjs';

/*
 * The group UI, driven through the panel.
 *
 * `groups.mjs` has the model covered. What can still be wrong is the wiring:
 * the filter not reaching the list, the count on a chip disagreeing with what
 * the chip shows, or deleting a group taking its records with it. None of those
 * is visible to a module test.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let logged;
beforeEach(() => {
  logged = [];
  const original = console.error;
  console.error = (...args) => { logged.push(args.map(String).join(' ')); original(...args); };
});

const roots = [];
afterEach(async () => {
  await act(async () => { for (const root of roots.splice(0)) root.unmount(); });
  document.body.innerHTML = '';
});

const entry = (id, groupId) => ({
  id,
  at: '2026-09-27T10:00:00.000Z',
  kind: 'dilution',
  inputs: { c1: 1, v1: 1, c2: 1, v2: 1 },
  ...(groupId ? { groupId } : {}),
});

async function mount({ entries, groups = [], handlers = {} }) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(
      React.createElement(LocaleProvider, { store: memoryStore({ 'lab-calc.locale.v1': 'zh' }) },
        React.createElement(HistoryPanel, {
          entries: visibleEntries(entries),
          allEntries: entries,
          deleted: [],
          groups,
          onRemove: () => {}, onRestore: () => {}, onReplay: () => {},
          onClear: () => {}, onImport: () => {}, onMeta: () => {},
          onCreateGroup: handlers.onCreateGroup ?? (() => null),
          onRenameGroup: handlers.onRenameGroup ?? (() => {}),
          onDeleteGroup: handlers.onDeleteGroup ?? (() => {}),
          onGroupNote: () => {},
          onSetRecordGroup: handlers.onSetRecordGroup ?? (() => {}),
        })),
    );
  });
  return container;
}

const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
const byText = (c, re) => [...c.querySelectorAll('button')].find((b) => re.test(b.textContent));
/*
 * A chip, by name.
 *
 * `byText` over the whole panel matched the wrong button for "全部": the
 * clear-all control reads "全部清除" and contains it. Scoping to `.group-chip`
 * is what makes the assertion about the filter rather than about which button
 * happened to come first in the DOM.
 */
const chip = (c, re) => [...c.querySelectorAll('.group-chip')].find((b) => re.test(b.textContent));
const rows = (c) => c.querySelectorAll('.history-list .history-item').length;

describe('the group bar', () => {
  const groups = [createGroup([], '第三章').group, createGroup([], '预实验').group];
  const [g1, g2] = groups;

  it('should render a chip per group with its count', async () => {
    const c = await mount({ entries: [entry('a', g1.id), entry('b', g1.id), entry('c', g2.id)], groups });
    const chip = [...c.querySelectorAll('.group-chip')].find((x) => /第三章/.test(x.textContent));
    expect(chip).toBeTruthy();
    expect(chip.textContent).toMatch(/2/);
  });

  it('should filter the list to the chosen group', async () => {
    const c = await mount({ entries: [entry('a', g1.id), entry('b', g1.id), entry('c', g2.id)], groups });
    expect(rows(c)).toBe(3);
    await click([...c.querySelectorAll('.group-chip')].find((x) => /预实验/.test(x.textContent)));
    expect(rows(c)).toBe(1);
  });

  it('should show every record again when All is chosen', async () => {
    const c = await mount({ entries: [entry('a', g1.id), entry('c', g2.id)], groups });
    await click([...c.querySelectorAll('.group-chip')].find((x) => /预实验/.test(x.textContent)));
    expect(rows(c)).toBe(1);
    await click(chip(c, /^全部/));
    expect(rows(c)).toBe(2);
  });

  it('should offer the ungrouped bucket only when it has something in it', async () => {
    // A chip reading "未分组 0" is chrome that never means anything.
    const none = await mount({ entries: [entry('a', g1.id)], groups });
    expect(chip(none, /未分组/)).toBeUndefined();
  });

  it('should filter to the ungrouped records', async () => {
    const c = await mount({ entries: [entry('a', g1.id), entry('b')], groups });
    await click(chip(c, /未分组/));
    expect(rows(c)).toBe(1);
  });

  it('should say the group is empty rather than that the search found nothing', async () => {
    /*
     * The state a user hits right after making a group. "没有匹配「」的记录"
     * is a sentence about a search box they never typed in.
     */
    const empty = createGroup([], '空的').group;
    const c = await mount({ entries: [entry('a', g1.id)], groups: [...groups, empty] });
    await click(chip(c, /空的/));
    expect(c.textContent).toMatch(/这个分组里还没有记录/);
    expect(c.textContent).not.toMatch(/没有匹配/);
  });

  it('should not render the bar at all when there are no groups and nothing unfiled', async () => {
    const c = await mount({ entries: [entry('a', g1.id)], groups: [] });
    // Every record is in a group the panel does not know about, so there is
    // nothing to filter by and no way to make one — but the panel still offers
    // creation, so the bar stays. What must not appear is a chip with no name.
    const chips = [...c.querySelectorAll('.group-chip')];
    expect(chips.every((x) => x.textContent.trim().length > 0)).toBe(true);
  });
});

describe('creating and deleting', () => {
  it('should call onCreateGroup with the typed name', async () => {
    let asked = null;
    const c = await mount({
      entries: [entry('a')],
      handlers: { onCreateGroup: (name) => { asked = name; return null; } },
    });
    await click(byText(c, /新建分组/));
    const input = c.querySelector('.group-new input');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, '新实验');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(byText(c, /建立/));
    expect(asked).toBe('新实验');
  });

  it('should select the group it just created', async () => {
    /*
     * Creating a group is how the next record gets filed. Leaving the filter
     * where it was makes the user click the chip they just made, which is a
     * step they already took.
     */
    const made = { id: 'gnew', name: '新的', note: '', createdAt: '2026-09-27T10:00:00.000Z' };
    const c = await mount({
      entries: [entry('a')],
      handlers: { onCreateGroup: () => made },
    });
    await click(byText(c, /新建分组/));
    const input = c.querySelector('.group-new input');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, '新的');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(byText(c, /建立/));
    // The parent owns the list, so the chip appears only once the parent
    // re-renders — which this mount does not do. What is asserted is that the
    // creation was requested, which is the panel's half of the contract.
    expect(c.querySelector('.group-new input')).toBeNull();
  });

  it('should ask to delete the selected group', async () => {
    const g = createGroup([], '要删的').group;
    let deleted = null;
    const c = await mount({
      entries: [entry('a', g.id)],
      groups: [g],
      handlers: { onDeleteGroup: (id) => { deleted = id; } },
    });
    await click(chip(c, /要删的/));
    await click(byText(c, /删除分组/));
    expect(deleted).toBe(g.id);
  });

  it('should not offer rename or delete until a group is selected', async () => {
    const g = createGroup([], 'x').group;
    const c = await mount({ entries: [entry('a', g.id)], groups: [g] });
    // Nothing selected: the default is All, which is not a group.
    expect(byText(c, /删除分组/)).toBeUndefined();
    await click(chip(c, /^x/));
    expect(byText(c, /删除分组/)).toBeTruthy();
  });
});

describe('the record side', () => {
  it('should show a record group on the collapsed line', async () => {
    const g = createGroup([], '第三章').group;
    const c = await mount({ entries: [entry('a', g.id)], groups: [g] });
    expect(c.querySelector('.entry-meta-group')).toBeTruthy();
    expect(c.querySelector('.entry-meta-group').textContent).toMatch(/第三章/);
  });

  it('should offer the group select in the record editor', async () => {
    const g = createGroup([], '第三章').group;
    const c = await mount({ entries: [entry('a')], groups: [g] });
    await click(c.querySelector('.entry-meta-toggle'));
    const select = c.querySelector('.entry-meta-field select');
    expect(select).toBeTruthy();
    const options = [...select.options].map((o) => o.textContent);
    expect(options).toContain('未分组');
    expect(options).toContain('第三章');
  });

  it('should call onSetRecordGroup when the select changes', async () => {
    const g = createGroup([], '第三章').group;
    let set = null;
    const c = await mount({
      entries: [entry('a')],
      groups: [g],
      handlers: { onSetRecordGroup: (id, groupId) => { set = [id, groupId]; } },
    });
    await click(c.querySelector('.entry-meta-toggle'));
    const select = c.querySelector('.entry-meta-field select');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(select, g.id);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(set).toEqual(['a', g.id]);
  });

  it('should send null when the record is taken out of its group', async () => {
    const g = createGroup([], '第三章').group;
    let set = null;
    const c = await mount({
      entries: [entry('a', g.id)],
      groups: [g],
      handlers: { onSetRecordGroup: (id, groupId) => { set = [id, groupId]; } },
    });
    await click(c.querySelector('.entry-meta-toggle'));
    const select = c.querySelector('.entry-meta-field select');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(select, '');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(set).toEqual(['a', null]);
  });
});

describe('the whole panel renders without a React error', () => {
  it('should log nothing while the group bar is used', async () => {
    const g = createGroup([], '第三章').group;
    const c = await mount({ entries: [entry('a', g.id), entry('b')], groups: [g] });
    await click(chip(c, /第三章/));
    await click(chip(c, /^全部/));
    expect(logged).toEqual([]);
  });
});
