import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

export default defineConfig({
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
