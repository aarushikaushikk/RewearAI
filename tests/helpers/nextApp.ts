import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const NEXT_BIN = path.join(ROOT, 'node_modules/next/dist/bin/next');

export interface RunningApp {
  origin: string;
  output: () => string;
  stop: () => Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

function stopProcess(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
    child.kill();
  });
}

/**
 * Runs the real build. MONGODB_URI and the Google settings are always passed, even when
 * empty, because Next.js doesn't load a variable from .env.local once it is defined.
 * A real value can't be picked up.
 */
export async function startApp(
  mongodbUri: string,
  extraEnv: Record<string, string> = {},
): Promise<RunningApp> {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  let output = '';
  const child = spawn(process.execPath, [NEXT_BIN, 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      MONGODB_URI: mongodbUri,
      APP_ORIGIN: origin,
      GOOGLE_CLIENT_ID: '',
      GOOGLE_CLIENT_SECRET: '',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (chunk) => (output += chunk));
  child.stderr?.on('data', (chunk) => (output += chunk));

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const ready = await fetch(`${origin}/sign-in`, { redirect: 'manual' }).catch(() => null);
    if (ready) {
      return { origin, output: () => output, stop: () => stopProcess(child) };
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await stopProcess(child);
  throw new Error('next start did not become ready. Run `npm run build` first.');
}
