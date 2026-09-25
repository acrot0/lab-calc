import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

export default defineConfig({
  /*
   * The React plugin is required, not optional.
   *
   * Without it esbuild falls back to the classic JSX transform, which compiles
   * `<div />` into `React.createElement(...)` and expects `React` to be in
   * scope at the point of use. In a file with more than one component — a chart
   * helper above the default export, say — the inner function does not see the
   * module-level binding, and rendering throws `React is not defined`. The
   * build was fine because vite.config.js has the plugin; only the test run
   * disagreed with it, which is the worst way for a difference to exist.
   */
  plugins: [react()],
  test: {
    // Standalone config so this project does not inherit the workspace-level
    // vitest settings from the parent directory.
    include: ['test/**/*.test.mjs'],
    pool: 'forks',
  },
  define: {
    // The locale files interpolate the app version, which the build injects.
    // Without this the test run fails on an undefined identifier rather than
    // testing anything — so the same value is read here from the same place.
    __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version),
  },
});
