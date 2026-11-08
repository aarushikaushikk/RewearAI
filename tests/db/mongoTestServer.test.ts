import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import mongoose from 'mongoose';
import { connectToDatabase, DatabaseConnectionError } from '@/lib/db';
import { User } from '@/models/User';
import {
  clearTestDatabase,
  MongoTestServerError,
  startMongoTestServer,
  type MongoTestServer,
} from '../helpers/mongoTestServer';
import { isPortOpen } from '../helpers/ports';

describe('temporary MongoDB server', () => {
  let server: MongoTestServer;
  let uriBeforeStart: string | undefined;

  beforeAll(async () => {
    uriBeforeStart = process.env.MONGODB_URI;
    server = await startMongoTestServer();
    await connectToDatabase();
  });

  afterAll(async () => {
    await server?.stop();
  });

  it('started with no URI inherited from the shell or .env.local', () => {
    expect(uriBeforeStart).toBe('');
  });

  it('connects through db.ts to the temporary database on 127.0.0.1 only', () => {
    expect(mongoose.connection.host).toBe('127.0.0.1');
    expect(mongoose.connection.port).toBe(server.port);
    expect(mongoose.connection.name).toBe(server.dbName);
    expect(server.dbName).toMatch(/^rewear_test_/);
  });

  it('listens on the loopback address only', async () => {
    const options = await mongoose.connection.db!.admin().command({ getCmdLineOpts: 1 });

    expect(options.parsed.net.bindIp).toBe('127.0.0.1');
  });

  it('stores records through the real models', async () => {
    await User.create({ email: 'stored@example.com' });

    expect(await User.countDocuments({ email: 'stored@example.com' })).toBe(1);
  });

  it('clears records but keeps indexes', async () => {
    await User.createIndexes();
    await User.create({ email: 'cleared@example.com' });

    await clearTestDatabase(server);

    expect(await User.countDocuments()).toBe(0);
    expect((await User.collection.indexes()).map((index) => index.name)).toContain('email_1');
  });

  it('refuses to clear a database other than its own, even on the same server', async () => {
    const other = await mongoose
      .createConnection(`mongodb://127.0.0.1:${server.port}/rewear_test_other`)
      .asPromise();
    try {
      await other.collection('keep').insertOne({ kept: true });

      await expect(clearTestDatabase(server, other)).rejects.toBeInstanceOf(MongoTestServerError);

      expect(await other.collection('keep').countDocuments()).toBe(1);
    } finally {
      await other.close();
    }
  });
});

describe('stopping the temporary MongoDB server', () => {
  it('closes the port, removes its files, clears the URI, and fails closed afterwards', async () => {
    const server = await startMongoTestServer();
    await connectToDatabase();
    const { port, dbPath } = server;
    expect(await isPortOpen(port)).toBe(true);
    expect(dbPath && existsSync(dbPath)).toBe(true);

    await server.stop();

    expect(await isPortOpen(port)).toBe(false);
    expect(existsSync(dbPath!)).toBe(false);
    expect(process.env.MONGODB_URI).toBe('');
    expect(mongoose.connection.readyState).toBe(0);
    await expect(connectToDatabase()).rejects.toBeInstanceOf(DatabaseConnectionError);
  });

  it('can start a fresh server afterwards, with its own port and database', async () => {
    const first = await startMongoTestServer();
    await first.stop();
    const second = await startMongoTestServer();

    try {
      await connectToDatabase();
      expect(second.dbName).not.toBe(first.dbName);
      expect(mongoose.connection.name).toBe(second.dbName);
      expect(mongoose.connection.port).toBe(second.port);
    } finally {
      await second.stop();
    }
  });

  it('refuses to clear once stopped', async () => {
    const server = await startMongoTestServer();
    await server.stop();

    await expect(clearTestDatabase(server)).rejects.toBeInstanceOf(MongoTestServerError);
  });
});
