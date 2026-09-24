import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

/**
 * The manifest is invisible in normal use: nothing renders it, so a broken
 * entry only shows up when someone installs the app and finds a shortcut that
 * goes nowhere. These assertions read the real files.
 */
const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf-8'));
const html = readFileSync('index.html', 'utf-8');

/** Tab ids the app actually defines, read from App.jsx. */
const tabIds = [...readFileSync('src/ui/App.jsx', 'utf-8').matchAll(/\{ id: '([a-z]+)', icon:/g)]
  .map((m) => m[1]);

describe('web app manifest', () => {
  it('should declare the fields an installable PWA needs', () => {
    // Without name/start_url/display/icons a browser will not offer to install.
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it('should ship both any and maskable icons at 192 and 512', () => {
    // Android crops maskable icons to the launcher's shape; using an "any" icon
    // for that purpose clips the mark.
    const byPurpose = (p) => manifest.icons.filter((i) => (i.purpose ?? 'any').includes(p));
    for (const purpose of ['any', 'maskable']) {
      const sizes = byPurpose(purpose).map((i) => i.sizes);
      expect(sizes, `${purpose} icons`).toContain('192x192');
      expect(sizes, `${purpose} icons`).toContain('512x512');
    }
  });

  it('should reference icon files that exist', () => {
    // A missing icon file fails silently — the browser just uses a default.
    for (const icon of manifest.icons) {
      const p = `public/${icon.src.replace(/^\.\//, '')}`;
      expect(existsSync(p), `${icon.src} should exist`).toBe(true);
    }
  });

  it('should only link shortcuts to tabs that exist', () => {
    // A stale id here is a shortcut that opens the default tab, which looks
    // like the shortcut is broken rather than misconfigured.
    for (const sc of manifest.shortcuts ?? []) {
      const m = /[?&]tab=([a-z]+)/.exec(sc.url);
      expect(m, `shortcut ${sc.name} should carry a tab param`).not.toBeNull();
      expect(tabIds, `shortcut ${sc.name} -> ${m[1]}`).toContain(m[1]);
    }
  });

  it('should link the icons from the document head', () => {
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('favicon-32.png');
    expect(html).toContain('apple-touch-icon');
  });

  it('should not rely solely on the deprecated apple meta tag', () => {
    // Chromium warns about `apple-mobile-web-app-capable` alone; the
    // unprefixed name is the current one. Both are present because older iOS
    // Safari only honours the apple-prefixed version.
    expect(html).toContain('name="mobile-web-app-capable"');
    expect(html).toContain('name="apple-mobile-web-app-capable"');
  });
});
