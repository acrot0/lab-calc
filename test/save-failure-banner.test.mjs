// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AppRoot from '../src/ui/AppRoot.jsx';
import { STORAGE_KEY, BUNDLE_FORMAT_FOR_TEST } from './helpers/save-failure-fixtures.mjs';

/*
 * A rejected storage write has to be visible.
 *
 * `saveHistory` has always returned `false` when the store refused the write —
 * a full quota, Safari private mode, a browser policy. Nothing checked it, and
 * the failure is invisible by construction: React state still holds the new
 * record, so the list looks right and keeps looking right until the next page
 * load, when it is empty and there is no explanation.
 *
 * These tests mount the real `App`, inside the real provider tree. A
 * module-level test cannot see this defect — the module was correct throughout,
 * and it is the wiring that was missing. Wiring is only exercised by a mounted
 * component, and the provider tree is only correct if the app's own is used.
 *
 * ## Why the store is stubbed globally
 *
 * `App` calls `resolveStore()` itself and memoises the result, rather than
 * taking the store as a prop — the same instance the locale, theme and field
 * providers share. So the only way to hand it a store that refuses writes is to
 * put one where `resolveStore()` will find it: `globalThis.localStorage`. That
 * is also the more faithful test, because it exercises the resolution path the
 * browser takes rather than a shortcut past it.
 *
 * see also: memory `load-save-effect-race-wipes-storage` — the same lesson,
 * learned the same way, about the same pair of effects.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__APP_VERSION__ = '0.0.0-test';

/*
 * Roots are tracked and unmounted, not just cleared.
 *
 * Clearing `document.body` leaves the root's scheduler work queued, and a lazy
 * chunk resolving after teardown commits into a destroyed window. Same reason
 * `history-trash.test.mjs` does this.
 */
const roots = [];
afterEach(() => {
  for (const r of roots.splice(0)) {
    try { r.unmount(); } catch { /* already gone */ }
  }
  document.body.innerHTML = '';
});

/**
 * Replace `globalThis.localStorage` with one whose writes can be switched off
 * mid-test, like a quota filling up.
 *
 * **`resolveStore()` probes storage before using it** — it writes and removes a
 * key, and falls back to an in-memory store if that throws. So a stub that
 * refused *every* write would be rejected at resolution and swapped for a
 * store that accepts them all, and the banner would never appear. The probe key
 * is let through for that reason, which is also what a real quota does: writing
 * works when the app starts and stops working once the space is gone.
 */
function installStorage({ refuse = false, seed = {} } = {}) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const map = new Map(Object.entries(seed));
  const state = { refuse };
  const store = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      // The availability probe `resolveStore()` performs. Letting it through
      // is what makes this a test of the save path rather than of the
      // fallback path.
      if (k === '__labcalc_probe__') return;
      if (state.refuse) throw new Error('QuotaExceededError');
      map.set(k, v);
    },
    removeItem: (k) => void map.delete(k),
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, writable: true, value: store,
  });
  return {
    state,
    map,
    store,
    restore: () => {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else delete globalThis.localStorage;
    },
  };
}

/**
 * Let React settle: drain microtasks and the scheduler's own queue.
 *
 * Not `setTimeout` — the suite forbids a bare one in a test body, and there is
 * no need for a real timer here. `act` flushes effects synchronously; the
 * remaining work is promise resolution, including a lazy tab chunk, which
 * settles on microtasks once the module is in the loader cache.
 */
async function settle() {
  for (let i = 0; i < 6; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await Promise.resolve(); });
  }
}

async function renderApp(store) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => { root.render(React.createElement(AppRoot, { store })); });
  await settle();
  return root;
}

/** The banner element, or null. */
function banner() {
  return document.querySelector('.save-failed');
}

/**
 * Put the first tab's lazy chunk in the loader cache before mounting.
 *
 * React's `lazy()` on a cold module resolves through the dynamic-import
 * machinery, which `act` alone does not drive — the tab body stays empty and
 * the tab's own controls never render. Importing it once here makes the lazy
 * resolution a microtask, so `settle()` can drain it.
 *
 * Only the first tab is needed: it is the one the app opens on.
 */
async function loadWeighTab() {
  await import('../src/ui/tabs/WeighTab.jsx');
}

describe('the standing banner for a rejected write', () => {
  it('should appear when the store refuses the write', async () => {
    const s = installStorage({ refuse: true });
    try {
      await renderApp(s.store);
      expect(banner()).not.toBeNull();
      expect(banner().getAttribute('role')).toBe('alert');
    } finally {
      s.restore();
    }
  });

  it('should say the history stopped saving, in either language', async () => {
    const s = installStorage({ refuse: true });
    try {
      await renderApp(s.store);
      expect(banner().textContent).toMatch(/历史已停止保存|History has stopped saving/);
    } finally {
      s.restore();
    }
  });

  it('should name the next action, not just the failure', async () => {
    // Telling someone their data is not being saved without telling them what
    // to do about it is telling them bad news and nothing else.
    const s = installStorage({ refuse: true });
    try {
      await renderApp(s.store);
      const btn = banner().querySelector('.save-failed-export');
      expect(btn).not.toBeNull();
      expect(btn.textContent).toMatch(/导出备份|Export backup/);
    } finally {
      s.restore();
    }
  });

  it('should not appear when writes land', async () => {
    const s = installStorage();
    try {
      await renderApp(s.store);
      expect(banner()).toBeNull();
    } finally {
      s.restore();
    }
  });

  it('should have no dismiss control', async () => {
    // A condition that persists should not be dismissible. The only thing that
    // clears this is a successful write, so a close button would be a lie.
    const s = installStorage({ refuse: true });
    try {
      await renderApp(s.store);
      const buttons = [...banner().querySelectorAll('button')];
      expect(buttons).toHaveLength(1);
      expect(buttons[0].className).toContain('save-failed-export');
    } finally {
      s.restore();
    }
  });

  it('should sit above the navigations, not inside a tab', async () => {
    // The history panel is one column of one tab, and a user whose writes have
    // stopped failing is not necessarily looking at it.
    const s = installStorage({ refuse: true });
    try {
      await renderApp(s.store);
      expect(banner().closest('.shell')).toBeNull();
      expect(banner().closest('.card')).toBeNull();
    } finally {
      s.restore();
    }
  });

  it('should not throw when its export button is clicked', async () => {
    // jsdom has no download path, so the object-URL call is stubbed. What is
    // being asserted is that the banner reaches the bundle writer with the
    // right argument — not that jsdom can save a file.
    const s = installStorage({ refuse: true });
    const created = [];
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = (blob) => { created.push(blob); return 'blob:stub'; };
    URL.revokeObjectURL = () => {};
    // The anchor's `download` attribute is what names the file; capturing it
    // proves the right writer ran.
    const clicks = [];
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function stubClick() { clicks.push(this.download); };
    try {
      await renderApp(s.store);
      expect(() => banner().querySelector('.save-failed-export').click()).not.toThrow();
      expect(created).toHaveLength(1);
      expect(clicks).toHaveLength(1);
      expect(clicks[0]).toMatch(/\.json$/);
    } finally {
      HTMLAnchorElement.prototype.click = originalClick;
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      s.restore();
    }
  });
});

describe('the banner clears when writes work again', () => {
  it('should disappear once a write succeeds', async () => {
    /*
     * If the flag were set once and never cleared, a user who freed space would
     * be told their storage is broken forever. The same store object is reused
     * with its refusal switched off, so the flag has to come from a fresh write
     * attempt rather than from a different store being constructed.
     *
     * Recording a calculation is what drives that attempt — the save effect
     * runs on the commit that follows a change to `entries`. The first-run
     * notice has to be acknowledged first, because it covers the tab controls.
     */
    const s = installStorage({ refuse: true });
    try {
      await loadWeighTab();
      const root = await renderApp(s.store);
      expect(banner()).not.toBeNull();

      const click = (re) => [...document.querySelectorAll('button')]
        .find((b) => re.test(b.textContent ?? ''));

      const ack = click(/understood|理解|读/);
      if (ack) await act(async () => { ack.click(); });
      await settle();

      s.state.refuse = false;
      const calc = click(/^Calculate$|^计算$/);
      expect(calc).toBeTruthy();
      await act(async () => { calc.click(); });
      await settle();
      expect(banner()).toBeNull();
    } finally {
      s.restore();
    }
  });
});

describe('the storage key is unchanged', () => {
  it('should keep the v1 key so an existing history still loads', async () => {
    expect(STORAGE_KEY).toBe('lab-calc.history.v1');
  });

  it('should export the bundle format a restore reads', async () => {
    // The banner's export is the archive — deleted records included, and
    // re-importable — not CSV or Markdown. A user whose storage is failing
    // needs the file they can restore from.
    expect(BUNDLE_FORMAT_FOR_TEST).toBe('lab-calc.history');
  });
});
