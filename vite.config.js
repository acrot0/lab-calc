import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Stamp the build id into the emitted sw.js.
 *
 * The service worker cache name has to change on every deploy, or a browser
 * holding an old shell keeps serving it — see the comment in public/sw.js.
 *
 * This runs on `closeBundle` against the output directory rather than in
 * `generateBundle`: files under `public/` are copied verbatim after the bundle
 * is generated, so they never appear in the rollup bundle and a generateBundle
 * hook silently finds nothing. The source file keeps its placeholder, which is
 * what lets `npm run dev` serve it unchanged.
 */
function stampServiceWorker(buildId) {
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    closeBundle() {
      const outDir = this.environment?.config?.build?.outDir ?? 'dist';
      const path = join(outDir, 'sw.js');
      let src;
      try {
        src = readFileSync(path, 'utf8');
      } catch {
        // No service worker emitted (e.g. a build that excludes public/).
        // Nothing to stamp, and failing the build over it would be worse.
        return;
      }
      if (!src.includes('__BUILD_ID__')) return;
      writeFileSync(path, src.replaceAll('__BUILD_ID__', buildId), 'utf8');
    },
  };
}

export default defineConfig(() => ({
  plugins: [react(), stampServiceWorker(String(Date.now()))],
  // Relative base so the build works both at a domain root and under the
  // /lab-calc/ subpath GitHub Pages serves project sites from.
  base: './',
  build: { outDir: 'dist' },
}));
