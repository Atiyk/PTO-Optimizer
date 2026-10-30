import { defineConfig } from 'vitest/config';

// Same environment the root (Days Off) run uses: a few data modules read browser globals
// (window caches and the prerender preset global) that came with the Days Off code.
export default defineConfig({
  test: { environment: 'jsdom', globals: false },
});
