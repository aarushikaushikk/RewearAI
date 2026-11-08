import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import mongoose, { type Connection } from 'mongoose';

const LOCAL_TEST_URI =
  /^mongodb:\/\/127\.0\.0\.1:([1-9]\d{0,4})\/(rewear_test_[A-Za-z0-9_-]+)(\?[A-Za-z0-9_=&-]*)?$/;
const MAX_PORT = 65535;

const REFUSED = 'Refused: database tests only run against a temporary local MongoDB server';
const COULD_NOT_START = 'The temporary MongoDB test server could not start';
const ALREADY_RUNNING = 'A temporary MongoDB test server is already running in this process';
const COULD_NOT_STOP = 'The temporary MongoDB test server did not stop cleanly';

/**
 * Takes a fixed message and never wraps another error, because errors from the
 * server or driver can contain connection strings and credentials.
 */
export class MongoTestServerError extends Error {
  override name = 'MongoTestServerError';
}

export interface TestInstance {
  getUri(dbName?: string): string;
  stop(options?: { doCleanup?: boolean }): Promise<unknown>;
  instanceInfo?: { dbPath?: string };
}

export type CreateTestInstance = (dbName: string) => Promise<TestInstance>;

export interface MongoTestServer {
  uri: string;
  port: number;
  dbName: string;
  dbPath: string | undefined;
  stop(): Promise<void>;
}

/**
 * Accepts only a URI for 127.0.0.1 with an explicit port, no credentials, one
 * host, and a `rewear_test_` database. Anything else is refused, so a URI for
 * Atlas or a shared database can't be used however it is written.
 */
export function assertLocalTestUri(uri: string): { port: number; dbName: string } {
  const match = LOCAL_TEST_URI.exec(uri);
  const port = match ? Number(match[1]) : 0;
  if (!match || port > MAX_PORT) {
    throw new MongoTestServerError(REFUSED);
  }
  return { port, dbName: match[2] };
}

const createMemoryServer: CreateTestInstance = async (dbName) => {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  return MongoMemoryServer.create({ instance: { ip: '127.0.0.1', dbName } });
};

/** db.ts keeps its connection here; a stale one would outlive the server. */
function forgetCachedConnection(): void {
  const { mongooseCache } = globalThis as typeof globalThis & {
    mongooseCache?: { conn: unknown; promise: unknown };
  };
  if (mongooseCache) {
    mongooseCache.conn = null;
    mongooseCache.promise = null;
  }
}

let isRunning = false;

/**
 * Starts a temporary MongoDB server and points MONGODB_URI at it for this
 * process. Any earlier value is discarded and never restored, so a URI from the
 * shell can't be used. There is no fallback: if the server can't start, this
 * throws and MONGODB_URI stays empty.
 */
export async function startMongoTestServer(
  createInstance: CreateTestInstance = createMemoryServer,
): Promise<MongoTestServer> {
  if (isRunning) {
    throw new MongoTestServerError(ALREADY_RUNNING);
  }
  isRunning = true;
  process.env.MONGODB_URI = '';

  const dbName = `rewear_test_${randomBytes(8).toString('hex')}`;

  let instance: TestInstance;
  try {
    instance = await createInstance(dbName);
  } catch {
    isRunning = false;
    throw new MongoTestServerError(COULD_NOT_START);
  }

  let uri: string;
  let port: number;
  try {
    uri = instance.getUri(dbName);
    const parsed = assertLocalTestUri(uri);
    if (parsed.dbName !== dbName) {
      throw new MongoTestServerError(REFUSED);
    }
    port = parsed.port;
  } catch {
    await instance.stop({ doCleanup: true }).catch(() => undefined);
    isRunning = false;
    throw new MongoTestServerError(REFUSED);
  }

  const shutDown = async (): Promise<void> => {
    process.env.MONGODB_URI = '';
    let failed = false;
    try {
      await mongoose.disconnect();
    } catch {
      failed = true;
    }
    forgetCachedConnection();
    try {
      await instance.stop({ doCleanup: true });
    } catch {
      failed = true;
    }
    isRunning = false;
    if (failed) {
      throw new MongoTestServerError(COULD_NOT_STOP);
    }
  };

  let stopping: Promise<void> | null = null;
  process.env.MONGODB_URI = uri;

  return {
    uri,
    port,
    dbName,
    dbPath: instance.instanceInfo?.dbPath,
    stop: () => (stopping ??= shutDown()),
  };
}

/**
 * Removes the files of a server whose test process was killed, which can't clean up after
 * itself. Only accepts a `mongo-mem-` folder directly inside the temp folder, so it can't
 * remove anything else, however the path is written.
 */
export function removeCrashedServerFiles(dbPath: string, tempRoot: string = tmpdir()): void {
  const resolved = path.resolve(dbPath);
  if (
    path.dirname(resolved) !== path.resolve(tempRoot) ||
    !/^mongo-mem-[A-Za-z0-9_-]+$/.test(path.basename(resolved))
  ) {
    throw new MongoTestServerError(REFUSED);
  }
  // On Windows, mongod can hold its files for some seconds after its port has closed.
  rmSync(resolved, { recursive: true, force: true, maxRetries: 150, retryDelay: 200 });
}

/** Refuses unless the connection is open to this exact server and database. */
function requireTemporaryDatabase(server: MongoTestServer, connection: Connection) {
  assertLocalTestUri(server.uri);

  const { db } = connection;
  if (
    !db ||
    connection.readyState !== mongoose.ConnectionStates.connected ||
    connection.host !== '127.0.0.1' ||
    connection.port !== server.port ||
    connection.name !== server.dbName
  ) {
    throw new MongoTestServerError(REFUSED);
  }
  return db;
}

/**
 * Deletes every record in the temporary database and keeps its indexes. Refuses
 * unless the connection is open to this exact server and database.
 */
export async function clearTestDatabase(
  server: MongoTestServer,
  connection: Connection = mongoose.connection,
): Promise<void> {
  const db = requireTemporaryDatabase(server, connection);

  for (const collection of await db.collections()) {
    await collection.deleteMany({});
  }
}

/**
 * Removes the temporary database, indexes included, and forgets that its indexes
 * were built, as if the app had never used it. Refuses like clearTestDatabase.
 */
export async function resetTestDatabase(
  server: MongoTestServer,
  connection: Connection = mongoose.connection,
): Promise<void> {
  const db = requireTemporaryDatabase(server, connection);

  await db.dropDatabase();
  const { requiredIndexInitialization } = globalThis as typeof globalThis & {
    requiredIndexInitialization?: Map<string, unknown>;
  };
  requiredIndexInitialization?.clear();
}

/** Closes the client but not the server, so the next operation has to reconnect. */
export async function disconnectTestClient(): Promise<void> {
  await mongoose.disconnect();
  forgetCachedConnection();
}
