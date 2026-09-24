/**
 * Service worker — offline support.
 *
 * Why this matters for this app specifically: a lab bench is often a bad place
 * for wifi (basement floors, Faraday-ish instrument rooms, guest networks that
 * drop). A calculator that stops working when the network does is a calculator
 * you stop trusting.
 *
 * Strategy:
 *   - App shell (HTML/JS/CSS/fonts/icons): cache-first, refreshed in the
 *     background. The shell is versioned by the build hash, so a new deploy
 *     gets a new URL and the old cache entry simply goes unused.
 *   - Navigation requests: network-first with a cache fallback, so a deploy is
 *     picked up promptly but a dead network still serves the app.
 *
 * No user data ever leaves the device; this worker only ever touches the
 * app's own static assets.
 */

/*
 * The cache name is the build id, injected at build time.
 *
 * A fixed name looks harmless but breaks the offline path it exists for: the
 * shell is cached at install and refreshed only opportunistically, and
 * `activate` purges every cache whose name differs from CACHE. With a constant
 * name nothing is ever purged, so a browser that cached an old index.html can
 * fall back to a shell referencing hashed assets from a previous build — files
 * that were never in this cache and are gone from the server. The app then
 * fails to boot, offline, which is exactly when it is supposed to work.
 *
 * Versioning the name makes each deploy a fresh cache: `activate` drops the old
 * one, and the fallback shell always matches the assets beside it.
 */
const CACHE = `lab-calc-${__BUILD_ID__}`;

// The shell is discovered at install time rather than hardcoded, because the
// hashed asset filenames change on every build.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['./', './index.html'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle same-origin GETs. Anything else (a POST, a cross-origin call)
  // is none of this worker's business and must not be intercepted.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit ?? caches.match('./index.html'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) {
        // Refresh in the background so the next load gets the newer asset.
        fetch(request)
          .then((res) => { if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone())); })
          .catch(() => { /* offline: the cached copy is the point */ });
        return hit;
      }
      return fetch(request).then((res) => {
        // Only cache a successful, basic response — caching an opaque or error
        // response would poison the cache with something unusable.
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      });
    }),
  );
});
