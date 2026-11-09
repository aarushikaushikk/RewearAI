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
    if (child.exitCode !== null) return resolve();
    child.once('exit', () => resolve());
    child.kill();
  });
}

export async function launchChrome(chromePath: string): Promise<RunningChrome> {
  const profileDir = mkdtempSync(path.join(tmpdir(), 'rewear-smoke-chrome-'));
  const child = spawn(chromePath, [...CHROME_FLAGS, `--user-data-dir=${profileDir}`, 'about:blank'], {
    stdio: 'ignore',
  });

  let port: number | null = null;
  for (let attempt = 0; attempt < 100 && port === null; attempt += 1) {
    await sleep(100);
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
    await close();
    throw new Error('Chrome did not start its DevTools endpoint');
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
