import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Standalone config so this project does not inherit the workspace-level
    // vitest settings from the parent directory.
    include: ['test/**/*.test.mjs'],
    pool: 'forks',
  },
});
