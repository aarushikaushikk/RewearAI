import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { launchChrome } from '../helpers/chromeCdp';

const profileDirs = () => new Set(readdirSync(tmpdir()).filter((name) => name.startsWith('rewear-smoke-chrome-')));

async function startupError(chromePath: string): Promise<Error> {
  try {
    await launchChrome(chromePath);
  } catch (err) {
    return err as Error;
  }
  throw new Error('launchChrome unexpectedly succeeded');
}

// Node stands in for a browser that dies at startup: it rejects Chrome's flags
// (`node: bad option: --headless=new`) and exits straight away, on every platform.
describe('launchChrome startup failures', () => {
  it('fails promptly with the exit code and the stderr tail when the browser exits', async () => {
    const started = Date.now();

    const error = await startupError(process.execPath);

    expect(Date.now() - started).toBeLessThan(5_000);
    expect(error.message).toMatch(/^Chrome did not start its DevTools endpoint: it exited with code \d+ after \d+\.\d s/);
    expect(error.message).toMatch(/bad option/i);
  }, 15_000);

  it('reports a missing executable as an error instead of crashing the test run', async () => {
    const missing = path.join(tmpdir(), 'rewear-no-such-chrome', 'chrome');

    const error = await startupError(missing);

    expect(error.message).toMatch(/^Chrome did not start its DevTools endpoint: it failed to spawn/);
    expect(error.message).toMatch(/ENOENT/);
  }, 15_000);

  it('removes its temporary profile after a failed start', async () => {
    const before = profileDirs();

    await startupError(process.execPath);

    expect([...profileDirs()].filter((dir) => !before.has(dir))).toEqual([]);
  }, 15_000);
});
