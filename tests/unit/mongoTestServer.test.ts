import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  assertLocalTestUri,
  MongoTestServerError,
  startMongoTestServer,
  type MongoTestServer,
  type TestInstance,
} from '../helpers/mongoTestServer';

// Made-up values shaped like real connection strings.
const SECRET = 's3cr3t-pass';
const ATLAS_SRV = `mongodb+srv://rewear-user:${SECRET}@cluster0.abcde.mongodb.net/rewear_test_x`;
const ATLAS_DIRECT = `mongodb://rewear-user:${SECRET}@cluster0-shard-00-00.abcde.mongodb.net:27017/rewear_test_x?ssl=true`;

function fakeInstance(uriFor: (dbName: string) => string): TestInstance {
  return {
    getUri: (dbName?: string) => uriFor(dbName ?? ''),
    stop: vi.fn().mockResolvedValue(true),
    instanceInfo: { dbPath: 'fake-path' },
  };
}

const localFake = () => fakeInstance((dbName) => `mongodb://127.0.0.1:27999/${dbName}?`);

async function errorFrom(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a rejection');
    },
    (err: unknown) => err,
  );
}

describe('assertLocalTestUri', () => {
  it.each([
    ['Atlas SRV', ATLAS_SRV],
    ['Atlas direct host', ATLAS_DIRECT],
    ['Atlas without credentials', 'mongodb+srv://cluster0.abcde.mongodb.net/rewear_test_x'],
    ['private network host', 'mongodb://10.0.0.5:27017/rewear_test_x'],
    ['all interfaces', 'mongodb://0.0.0.0:27017/rewear_test_x'],
    ['localhost name, which can resolve elsewhere', 'mongodb://localhost:27017/rewear_test_x'],
    ['IPv6 loopback', 'mongodb://[::1]:27017/rewear_test_x'],
    ['second host in a list', 'mongodb://127.0.0.1:27017,evil.example.com:27017/rewear_test_x'],
    ['loopback used as a username', 'mongodb://127.0.0.1@evil.example.com:27017/rewear_test_x'],
    ['loopback user and password', `mongodb://127.0.0.1:${SECRET}@evil.example.com/rewear_test_x`],
    ['credentials on loopback', `mongodb://user:${SECRET}@127.0.0.1:27017/rewear_test_x`],
    ['loopback as a subdomain', 'mongodb://127.0.0.1.evil.example.com:27017/rewear_test_x'],
    ['host hidden after a fragment', 'mongodb://127.0.0.1:27017/rewear_test_x#@evil.example.com'],
    ['host hidden in a query', 'mongodb://127.0.0.1:27017/rewear_test_x?a=b@evil.example.com'],
    ['the real database name', 'mongodb://127.0.0.1:27017/rewear'],
    ['no database name', 'mongodb://127.0.0.1:27017/'],
    ['no port', 'mongodb://127.0.0.1/rewear_test_x'],
    ['port out of range', 'mongodb://127.0.0.1:99999/rewear_test_x'],
    ['leading whitespace', ' mongodb://127.0.0.1:27017/rewear_test_x'],
    ['different scheme case', 'MONGODB://127.0.0.1:27017/rewear_test_x'],
    ['empty string', ''],
  ])('refuses %s', (_label, uri) => {
    expect(() => assertLocalTestUri(uri)).toThrow(MongoTestServerError);
  });

  it.each([ATLAS_SRV, ATLAS_DIRECT])('never repeats the URI or its password in the error', (uri) => {
    const err = (() => {
      try {
        assertLocalTestUri(uri);
      } catch (caught) {
        return caught as Error;
      }
      throw new Error('expected a refusal');
    })();

    const everything = `${err.message} ${err.stack} ${String(err.cause)} ${JSON.stringify(err)}`;
    expect(everything).not.toContain(SECRET);
    expect(everything).not.toContain('mongodb.net');
  });

  it.each([
    ['a plain temporary URI', 'mongodb://127.0.0.1:27017/rewear_test_abc123', 27017],
    ['the trailing ? the server adds', 'mongodb://127.0.0.1:50123/rewear_test_abc123?', 50123],
    ['simple options', 'mongodb://127.0.0.1:50123/rewear_test_abc123?directConnection=true', 50123],
  ])('accepts %s', (_label, uri, port) => {
    expect(assertLocalTestUri(uri)).toEqual({ port, dbName: 'rewear_test_abc123' });
  });
});

describe('startMongoTestServer', () => {
  let started: MongoTestServer | undefined;

  beforeEach(() => {
    started = undefined;
  });

  afterEach(async () => {
    await started?.stop();
    process.env.MONGODB_URI = '';
  });

  it('ignores a URI already in the environment and points tests at the temporary server', async () => {
    process.env.MONGODB_URI = ATLAS_SRV;

    started = await startMongoTestServer(async () => localFake());

    expect(process.env.MONGODB_URI).toBe(started.uri);
    expect(process.env.MONGODB_URI).toMatch(/^mongodb:\/\/127\.0\.0\.1:27999\/rewear_test_/);
  });

  it('gives each server its own database name', async () => {
    const first = await startMongoTestServer(async () => localFake());
    await first.stop();
    started = await startMongoTestServer(async () => localFake());

    expect(started.dbName).not.toBe(first.dbName);
  });

  it('clears the URI when stopped, without restoring an earlier one', async () => {
    process.env.MONGODB_URI = ATLAS_SRV;
    const server = await startMongoTestServer(async () => localFake());

    await server.stop();

    expect(process.env.MONGODB_URI).toBe('');
  });

  it('fails safely when the server cannot start, with no secrets and no URI left set', async () => {
    process.env.MONGODB_URI = ATLAS_SRV;

    const err = (await errorFrom(
      startMongoTestServer(async () => {
        throw new Error(`could not start: ${ATLAS_SRV}`);
      }),
    )) as Error;

    expect(err).toBeInstanceOf(MongoTestServerError);
    expect(`${err.message} ${err.stack} ${String(err.cause)}`).not.toContain(SECRET);
    expect(process.env.MONGODB_URI).toBe('');
  });

  it.each([
    ['Atlas', () => ATLAS_SRV],
    ['another host', (dbName: string) => `mongodb://10.0.0.5:27017/${dbName}`],
    ['a different database', () => 'mongodb://127.0.0.1:27999/rewear_test_other'],
  ])('refuses and stops a server that reports %s', async (_label, uriFor) => {
    const instance = fakeInstance(uriFor);

    await expect(startMongoTestServer(async () => instance)).rejects.toBeInstanceOf(
      MongoTestServerError,
    );

    expect(instance.stop).toHaveBeenCalledTimes(1);
    expect(process.env.MONGODB_URI).toBe('');
  });

  it('can start again after a failed start', async () => {
    await errorFrom(
      startMongoTestServer(async () => {
        throw new Error('no binary');
      }),
    );

    started = await startMongoTestServer(async () => localFake());

    expect(started.port).toBe(27999);
  });

  it('refuses a second server while one is running', async () => {
    started = await startMongoTestServer(async () => localFake());

    await expect(startMongoTestServer(async () => localFake())).rejects.toBeInstanceOf(
      MongoTestServerError,
    );
    expect(process.env.MONGODB_URI).toBe(started.uri);
  });

  it('stops only once when stop is called repeatedly', async () => {
    const instance = localFake();
    const server = await startMongoTestServer(async () => instance);

    await Promise.all([server.stop(), server.stop()]);
    await server.stop();

    expect(instance.stop).toHaveBeenCalledTimes(1);
  });

  it('reports a failed stop safely and still clears the URI', async () => {
    const instance = localFake();
    vi.mocked(instance.stop).mockRejectedValue(new Error(`stop failed: ${ATLAS_SRV}`));
    const server = await startMongoTestServer(async () => instance);

    const err = (await errorFrom(server.stop())) as Error;

    expect(err).toBeInstanceOf(MongoTestServerError);
    expect(`${err.message} ${err.stack} ${String(err.cause)}`).not.toContain(SECRET);
    expect(process.env.MONGODB_URI).toBe('');
  });

  it('logs nothing, so a URI can never reach the logs', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );

    const server = await startMongoTestServer(async () => localFake());
    await server.stop();
    await errorFrom(
      startMongoTestServer(async () => {
        throw new Error(ATLAS_SRV);
      }),
    );

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});
