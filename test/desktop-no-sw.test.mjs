import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/*
 * The desktop build must not register a service worker.
 *
 * ## The bug this pins
 *
 * Tauri serves the app from `http://tauri.localhost`, which is a **real HTTP
 * origin** — unlike Electron's `file://`, where `navigator.serviceWorker` is
 * genuinely absent. So the guard in `main.jsx` passed, the worker registered,
 * and its offline fallback (`caches.match('./index.html')`) began serving a
 * shell from an earlier build. That shell references hashed asset filenames
 * that no longer exist, so the window came up blank — and stayed blank, because
 * the cache outlives the process.
 *
 * Reproduced with a planted stale shell: `.tmp/diag/sw-stale-probe.mjs` showed
 * `rootChildren: 0` on relaunch, which is the white screen.
 *
 * ## Why the guard is a build constant and not a runtime check
 *
 * The old guard asked "does the browser have the API". The right question is
 * "does this build need an offline cache" — and for a packaged desktop app the
 * answer is no, because the assets are already on disk. A runtime check cannot
 * tell the two builds apart; they differ only in how they are served.
 */

const viteConfig = readFileSync('vite.config.js', 'utf8');
const mainJsx = readFileSync('src/ui/main.jsx', 'utf8');
const desktopScript = readFileSync('scripts/package-desktop.mjs', 'utf8');
const tauriConf = readFileSync('src-tauri/tauri.conf.json', 'utf8');

describe('desktop build and the service worker', () => {
  it('should define a build constant the app can branch on', () => {
    expect(viteConfig).toContain('__NO_SW__');
  });

  it('should set that constant for the desktop mode only', () => {
    // The web build keeps the worker: that is where offline has real value.
    //
    // The expression is evaluated rather than string-matched, because the
    // define is written as a function of the mode — `mode === 'desktop'` — and
    // a text assertion would either pin the spelling or pass for a value that
    // happens to look right. Evaluating it asks the only question that matters:
    // what does the build actually get?
    const expr = /__NO_SW__:\s*([^,\n]+),/.exec(viteConfig)?.[1];
    expect(expr, '__NO_SW__ must be defined as an expression').toBeTruthy();
    // eslint-disable-next-line no-new-func
    const resolve = new Function('mode', `return (${expr});`);
    expect(resolve('desktop')).toBe(true);
    expect(resolve('web')).toBe(false);
    expect(resolve(undefined)).toBe(false);
  });

  it('should not register when the constant is set', () => {
    // The constant has to be *read* — a define nobody consumes is decoration.
    expect(mainJsx).toMatch(/__NO_SW__/);
    expect(mainJsx).toMatch(/!__NO_SW__|__NO_SW__\s*!==?\s*true/);
  });

  it('should still guard on the API existing, for the web build', () => {
    // `serviceWorker in navigator` is absent in older browsers and in any
    // non-secure context; registration must not break the app there.
    expect(mainJsx).toContain("'serviceWorker' in navigator");
  });

  it('should route the Tauri build through the desktop mode', () => {
    // If the Tauri build used a mode other than `desktop`, the constant would
    // never be set and the worker would register again.
    expect(tauriConf).toContain('--mode desktop');
  });

  it('should not claim the API is unavailable under file://', () => {
    // The comment that caused this asserted `navigator.serviceWorker` is
    // unavailable under `file://`. True for Electron, false for Tauri — and it
    // was the Tauri build that broke. A comment stating a fact about one
    // packaging as though it held for both is how the bug got in.
    expect(desktopScript).not.toMatch(/serviceWorker` is unavailable under file:\/\//);
  });
});
