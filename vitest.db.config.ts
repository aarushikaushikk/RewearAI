import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Real-database tests, run by `npm run test:db`. They only use a temporary server
// from tests/helpers/mongoTestServer.ts, and never MONGODB_URI from the shell.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // `server-only` throws outside a React Server Component build; stub it for Node tests.
      'server-only': path.resolve(__dirname, 'tests/stubs/serverOnly.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/db/**/*.test.ts'],
    // One process per file, each with its own server and db.ts connection.
    pool: 'forks',
    fileParallelism: false,
    // The first run may need to download mongod.
    hookTimeout: 120_000,
    testTimeout: 30_000,
    // Overrides the shell, so a real URI is never picked up.
    env: { MONGODB_URI: '' },
  },
});
