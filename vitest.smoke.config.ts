import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Runs the production build against a temporary MongoDB server. `npm run test:smoke`
// builds first. It only uses tests/helpers/mongoTestServer.ts, never a real database.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'server-only': path.resolve(__dirname, 'tests/stubs/serverOnly.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/smoke/**/*.smoke.ts'],
    pool: 'forks',
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 60_000,
    // Overrides the shell, so a real URI is never picked up.
    env: { MONGODB_URI: '' },
  },
});
