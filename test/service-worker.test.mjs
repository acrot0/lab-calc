import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const SW = 'public/sw.js';

describe('service worker', () => {
  const src = readFileSync(SW, 'utf8');

  it('should derive its cache name from a build-time id, not a constant', () => {
    // A fixed cache name means `activate` never purges anything: the worker
    // only deletes caches whose name differs from CACHE. A browser holding a
    // stale shell then falls back to an index.html referencing hashed assets
    // from a previous build, and the app fails to boot offline.
    const m = /const CACHE = `lab-calc-\$\{([A-Z_]+)\}`/.exec(src);
    expect(m, 'CACHE must interpolate a build id').not.toBeNull();
    expect(src).toContain('__BUILD_ID__');
  });

  it('should purge caches that are not the current build', () => {
    expect(src).toContain('caches.delete');
    expect(src).toContain('k !== CACHE');
  });

  it('should only intercept same-origin GETs', () => {
    // Intercepting a POST or a cross-origin request would be a correctness bug,
    // not a performance one — the app must never see a cached mutation.
    expect(src).toContain("request.method !== 'GET'");
    expect(src).toContain('url.origin !== self.location.origin');
  });

  it('should never cache a non-ok or opaque response', () => {
    // Caching an error page poisons the cache with something unusable, and an
    // opaque response has no status to check later.
    expect(src).toContain("res.ok && res.type === 'basic'");
  });

  it('should not have been stamped in the source tree', () => {
    // The build writes to dist/ only. A stamped source file would mean the dev
    // server serves a frozen cache name.
    expect(src).not.toMatch(/lab-calc-\d{10,}/);
  });

  it('should ship a manifest alongside it', () => {
    expect(existsSync('public/manifest.webmanifest')).toBe(true);
  });
});
