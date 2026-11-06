import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { removeCrashedServerFiles } from '../helpers/mongoTestServer';
import { isPortOpen } from '../helpers/ports';

// Made-up value, shaped like a real connection string.
const SHELL_URI = 'mongodb+srv://rewear-user:s3cr3t-pass@cluster0.abcde.mongodb.net/rewear';
const ROOT = path.resolve(__dirname, '../..');

interface FixtureReport {
  port: number;
  dbPath: string;
  uriBeforeStart: string;
}

const tempDirs: string[] = [];
const reports: FixtureReport[] = [];

/** Runs a separate Vitest process whose only test fails or crashes while a server is running. */
function runFixture(mode: 'fail' | 'crash') {
  const dir = mkdtempSync(path.join(tmpdir(), 'rewear-fixture-'));
  tempDirs.push(dir);
  const output = path.join(dir, 'report.json');

  const run = spawnSync(
    process.execPath,
    [
      path.join(ROOT, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--config',
      'tests/db/fixtures/failingRun.config.ts',
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 180_000,
      env: {
        ...process.env,
        MONGODB_URI: SHELL_URI,
        FIXTURE_MODE: mode,
        FIXTURE_OUTPUT: output,
      },
    },
  );

  const report = JSON.parse(readFileSync(output, 'utf8')) as FixtureReport;
  reports.push(report);
  return { run, report, printed: `${run.stdout}${run.stderr}` };
}

async function waitForPortToClose(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isPortOpen(port))) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return !(await isPortOpen(port));
}

describe('cleaning up after failures', () => {
  // A crashed process can't clean up, so its server's files are removed here.
  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    for (const report of reports.splice(0)) {
      await waitForPortToClose(report.port, 60_000);
      removeCrashedServerFiles(report.dbPath);
      expect(existsSync(report.dbPath)).toBe(false);
    }
  });

  it('stops the server when a test fails', async () => {
    const { run, report, printed } = runFixture('fail');

    expect(run.status).not.toBe(0);
    expect(printed).toContain('expected fixture failure');
    expect(await isPortOpen(report.port)).toBe(false);
    expect(existsSync(report.dbPath)).toBe(false);
  }, 200_000);

  it('stops the server when the test process crashes', async () => {
    const { run, report } = runFixture('crash');

    expect(run.status).not.toBe(0);
    expect(await waitForPortToClose(report.port, 60_000)).toBe(true);
  }, 300_000);

  it.each(['fail', 'crash'] as const)(
    'never uses or prints a URI from the shell when a run ends with %s',
    (mode) => {
      const { report, printed } = runFixture(mode);

      expect(report.uriBeforeStart).toBe('');
      expect(printed).not.toContain('mongodb://');
      expect(printed).not.toContain('mongodb+srv://');
      expect(printed).not.toContain('s3cr3t-pass');
    },
    200_000,
  );
});
