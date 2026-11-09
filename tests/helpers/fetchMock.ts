import { vi } from 'vitest';

export type Reply = { status: number; body?: unknown } | 'network-error' | Promise<never>;

function respond(reply: Reply): Promise<Response> {
  if (reply === 'network-error') {
    return Promise.reject(new TypeError('Failed to fetch'));
  }
  if (reply instanceof Promise) {
    return reply;
  }
  return Promise.resolve({
    ok: reply.status >= 200 && reply.status < 300,
    status: reply.status,
    json: async () => reply.body ?? {},
  } as Response);
}

/**
 * Replaces fetch. Each "METHOD url" key answers with its queued replies, in order;
 * a call with no reply left fails the test.
 */
export function mockRoutes(routes: Record<string, Reply[]>) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${url}`;
    const reply = routes[key]?.shift();
    if (!reply) {
      throw new Error(`Unexpected request: ${key}`);
    }
    return respond(reply);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

/** A reply that never arrives, for observing loading states. */
export function pending(): Promise<never> {
  return new Promise<never>(() => {});
}
