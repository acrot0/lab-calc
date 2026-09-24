import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base so the build works both at a domain root and under the
  // /lab-calc/ subpath GitHub Pages serves project sites from.
  base: './',
  build: { outDir: 'dist' },
});
