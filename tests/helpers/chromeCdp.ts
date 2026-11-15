import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * A minimal Chrome DevTools Protocol client for opt-in browser smoke tests, using only Node's
 * built-in fetch and WebSocket (no dependency). Chrome runs headless with a throwaway
 * profile and its background services off, so the only network traffic is the page's own.
 */

type Params = Record<string, unknown>;
type Handler = (params: Params) => void;

export interface CdpPage {
  send<T = Params>(method: string, params?: Params): Promise<T>;
  on(method: string, handler: Handler): void;
  /** Evaluates an expression in the page, awaiting a returned promise, and returns its value. */
  evaluate<T>(expression: string): Promise<T>;
  /** Polls `expression` until it is truthy, or throws after `timeoutMs`, naming `label`. */
  waitFor(expression: string, label: string, timeoutMs?: number): Promise<void>;
}

export interface RunningChrome {
  newPage(): Promise<CdpPage>;
  close(): Promise<void>;
}

const CHROME_FLAGS = [
  '--headless=new',
  '--remote-debugging-port=0',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-sync',
  '--disable-default-apps',
  '--no-pings',
  '--metrics-recording-only',
];

/** A cold first start on a shared CI runner can take well over 10 s. */
const STARTUP_TIMEOUT_MS = 30_000;
const STARTUP_POLL_MS = 100;
/** How much of Chrome's stderr a startup error repeats. */
const STDERR_TAIL_CHARS = 4_000;
/** How long `stop` waits after asking Chrome to quit before killing it outright. */
const FORCE_KILL_AFTER_MS = 5_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function readDevToolsPort(profileDir: string): number | null {
  try {
    const [port] = readFileSync(path.join(profileDir, 'DevToolsActivePort'), 'utf8').split('\n');
    return Number(port) || null;
  } catch {
    return null;
  }
}

async function connect(wsUrl: string): Promise<CdpPage> {
  const socket = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('DevTools connection failed')), { once: true });
  });

  let nextId = 0;
  const pending = new Map<number, { resolve: (v: Params) => void; reject: (e: Error) => void }>();
  const handlers = new Map<string, Handler[]>();

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number;
      method?: string;
      params?: Params;
      result?: Params;
      error?: { message: string };
    };
    if (message.id !== undefined) {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) waiter?.reject(new Error(`${message.error.message}`));
      else waiter?.resolve(message.result ?? {});
    } else if (message.method) {
      for (const handler of handlers.get(message.method) ?? []) handler(message.params ?? {});
    }
  });

  const page: CdpPage = {
    send<T>(method: string, params: Params = {}) {
      const id = ++nextId;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: (v) => resolve(v as T), reject });
      });
    },
    on(method, handler) {
      handlers.set(method, [...(handlers.get(method) ?? []), handler]);
    },
    async evaluate<T>(expression: string) {
      const result = await page.send<{
        result: { value?: unknown };
        exceptionDetails?: { text: string; exception?: { description?: string } };
      }>('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      }
      return result.result.value as T;
    },
    async waitFor(expression, label, timeoutMs = 20_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (await page.evaluate<boolean>(`Boolean(${expression})`).catch(() => false)) return;
        await sleep(100);
      }
      throw new Error(`Timed out waiting for: ${label}`);
    },
  };
  return page;
}

function stop(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    // Already gone: it exited, was killed by a signal, or never spawned (no pid, no 'exit').
    if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return resolve();
    const forceKill = setTimeout(() => child.kill('SIGKILL'), FORCE_KILL_AFTER_MS);
    child.once('exit', () => {
      clearTimeout(forceKill);
      resolve();
    });
    child.kill();
  });
}

export async function launchChrome(chromePath: string): Promise<RunningChrome> {
  const profileDir = mkdtempSync(path.join(tmpdir(), 'rewear-smoke-chrome-'));
  const startedAt = Date.now();
  const child = spawn(chromePath, [...CHROME_FLAGS, `--user-data-dir=${profileDir}`, 'about:blank'], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  // Keep only the end of stderr, and keep reading it for Chrome's whole life so a full pipe
  // can never block the browser.
  let stderrTail = '';
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => {
    stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_CHARS);
  });
  // Without these listeners a failed spawn would surface as an unhandled error, and an early
  // exit would go unnoticed until the timeout.
  const ended: { spawnError?: Error; exit?: { code: number | null; signal: NodeJS.Signals | null } } = {};
  child.on('error', (err) => {
    ended.spawnError ??= err;
  });
  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
  child.once('exit', (code, signal) => {
    ended.exit = { code, signal };
  });

  let port: number | null = null;
  while (port === null && !ended.spawnError && !ended.exit && Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    await sleep(STARTUP_POLL_MS);
    port = readDevToolsPort(profileDir);
  }

  const close = async () => {
    await stop(child);
    // Chrome can hold profile files briefly after exiting on Windows.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        rmSync(profileDir, { recursive: true, force: true });
        return;
      } catch {
        await sleep(250);
      }
    }
  };

  if (port === null) {
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    const { spawnError, exit } = ended;
    if (exit) {
      // 'exit' can fire before stderr is drained; give the last lines a moment to arrive.
      await Promise.race([closed, sleep(1_000)]);
    }
    const reason = spawnError
      ? `it failed to spawn (${spawnError.message})`
      : exit
        ? `it exited with ${exit.signal ? `signal ${exit.signal}` : `code ${exit.code}`} after ${seconds} s`
        : `no DevToolsActivePort file after ${seconds} s`;
    await close();
    const stderr = stderrTail.trim();
    throw new Error(
      `Chrome did not start its DevTools endpoint: ${reason}` +
        (stderr ? `\nChrome stderr (last ${STDERR_TAIL_CHARS} characters at most):\n${stderr}` : ''),
    );
  }

  return {
    async newPage() {
      const target = (await (
        await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
      ).json()) as { webSocketDebuggerUrl: string };
      return connect(target.webSocketDebuggerUrl);
    },
    close,
  };
}
