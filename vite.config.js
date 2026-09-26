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

export default defineConfig(({ mode }) => ({
  plugins: [react(), stampServiceWorker(String(Date.now()))],
  // Relative base so the build works both at a domain root and under the
  // /lab-calc/ subpath GitHub Pages serves project sites from.
  base: './',
  build: { outDir: 'dist' },
  /*
   * The desktop build is a plain script; the web build is a module.
   *
   * The desktop app loads over `file://`, and the packager has to strip
   * `type="module"` for it to run at all — module scripts are subject to CORS
   * and a `file://` origin is opaque, so Chromium refuses them. What replaced
   * it was a bundle that still contained `import.meta`, and that is a **syntax
   * error** outside a module: the whole script failed to parse and the window
   * stayed blank. Measured: `SyntaxError: Cannot use 'import.meta' outside a
   * module`, 5/10 on the desktop smoke test, `#root` empty.
   *
   * `import.meta` comes from Vite's own preload helper, which uses
   * `import.meta.url` to resolve chunk URLs. Turning code splitting off does
   * not remove it — the helper is injected regardless — so the fix is the
   * output **format**: an IIFE has no module semantics and nothing to resolve,
   * and Vite emits neither `import.meta` nor `import()` into one. Verified on
   * the real output: 0 occurrences of either.
   *
   * Both settings are needed. IIFE alone would still leave the dynamic imports
   * that a split build emits, and `codeSplitting: false` alone leaves the
   * `import.meta` that broke it. They live under `build.rolldownOptions.output`
   * — an earlier attempt put `codeSplitting` under `build`, where it was
   * silently ignored and the packaged app stayed broken.
   *
   * The packager's own comment had asserted "the bundle is a single
   * self-contained file with no import statements" — true when written, and
   * quietly false once code splitting arrived. Nothing in the unit suite can
   * see any of this: it only fails under `file://`, which is why
   * `scripts/test-desktop.mjs` drives the real executable, and why the packager
   * now refuses a bundle that would not parse.
   *
   * Splitting is kept for the web build, where it is a real win — the elements
   * tab and the SMILES renderer are only fetched when opened.
   */
  ...(mode === 'desktop'
    ? {
      build: {
        outDir: 'dist',
        rolldownOptions: {
          output: { format: 'iife', name: 'LabCalc', codeSplitting: false },
        },
      },
    }
    : {}),
  define: {
    // The footer version used to be a literal in each locale file, which meant
    // a release had to remember to edit two strings that nothing else linked
    // to package.json. Reading it from the manifest at build time removes the
    // drift rather than relying on the release checklist to catch it.
    __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version),
  },
}));
