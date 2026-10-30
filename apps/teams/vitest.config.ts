import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // 'server-only' throws outside the react-server condition; tests are server-side.
      'server-only': fileURLToPath(new URL('./src/test/empty.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    // Tests always run with AI off and an in-process PGlite database.
    env: { AI_DISABLED: '1', HOLIDAYS_OFFLINE: '1', SESSION_SECRET: 'test-secret-not-for-production' },
    testTimeout: 20000,
  },
});
