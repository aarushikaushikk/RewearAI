import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import standardConfig from '../../vitest.config';
import databaseConfig from '../../vitest.db.config';
import smokeConfig from '../../vitest.smoke.config';

const scripts = JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'))
  .scripts as Record<string, string>;

describe('standard test configuration', () => {
  it('keeps database tests out of npm test', () => {
    expect(standardConfig.test?.exclude).toContain('tests/db/**');
  });

  it('still runs React component tests and tests beside the models', () => {
    expect(standardConfig.test?.include).toEqual(
      expect.arrayContaining(['src/**/*.test.ts', 'tests/**/*.test.ts', 'tests/**/*.test.tsx']),
    );
  });

  it('keeps the default exclusions, such as node_modules', () => {
    expect(standardConfig.test?.exclude).toEqual(
      expect.arrayContaining(['**/node_modules/**']),
    );
  });

  it('blanks MONGODB_URI', () => {
    expect(standardConfig.test?.env?.MONGODB_URI).toBe('');
  });
});

describe('database test configuration', () => {
  it('runs only tests in tests/db', () => {
    expect(databaseConfig.test?.include).toEqual(['tests/db/**/*.test.ts']);
  });

  it('blanks MONGODB_URI, so a value from the shell is never used', () => {
    expect(databaseConfig.test?.env?.MONGODB_URI).toBe('');
  });

  it('gives each test file its own process', () => {
    expect(databaseConfig.test?.pool).toBe('forks');
    expect(databaseConfig.test?.isolate).not.toBe(false);
  });
});

describe('test commands', () => {
  it('runs database tests only through test:db', () => {
    expect(scripts.test).toBe('vitest run');
    expect(scripts['test:db']).toBe('vitest run --config vitest.db.config.ts');
  });
});

describe('smoke test configuration', () => {
  it('blanks MONGODB_URI, so a URI from the shell is never used', () => {
    expect(smokeConfig.test?.env?.MONGODB_URI).toBe('');
  });

  it('only runs files that npm test does not pick up', () => {
    expect(smokeConfig.test?.include).toEqual(['tests/smoke/**/*.smoke.ts']);
    expect(standardConfig.test?.include).not.toContain('tests/smoke/**/*.smoke.ts');
  });

  it('builds before running, so it never tests a stale build', () => {
    expect(scripts['test:smoke']).toBe('next build && vitest run --config vitest.smoke.config.ts');
  });
});
