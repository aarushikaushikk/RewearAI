import path from 'node:path';
import { defineConfig } from 'vitest/config';

const root = path.resolve(__dirname, '../../..');

// Used only by mongoTestServerFailure.test.ts.
export default defineConfig({
  root,
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      'server-only': path.resolve(root, 'tests/stubs/serverOnly.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/db/fixtures/failingRun.fixture.ts'],
    pool: 'forks',
    hookTimeout: 120_000,
    env: { MONGODB_URI: '' },
  },
});
