import path from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // Real-database tests run separately through `npm run test:db`.
    exclude: [...configDefaults.exclude, 'tests/db/**'],
    environmentOptions: {},
    // Overrides the shell, so this suite can never connect to a real database.
    env: { MONGODB_URI: '' },
  },
});
