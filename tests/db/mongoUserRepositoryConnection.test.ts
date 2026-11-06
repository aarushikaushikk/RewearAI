import { afterAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoUserRepository } from '@/lib/repositories/mongoUserRepository';
import { RepositoryError } from '@/lib/repositories/repositoryErrors';
import { PASSWORD_HASH } from '../contracts/fixtures';
import { startMongoTestServer, type MongoTestServer } from '../helpers/mongoTestServer';

// Kept apart from the other repository tests, which connect before they start.
describe('MongoUserRepository connection', () => {
  const repo = new MongoUserRepository();
  let server: MongoTestServer | undefined;

  afterAll(async () => {
    await server?.stop();
  });

  it('fails with a fixed message when the database cannot be reached', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const err = await repo.findByEmail('secret@example.com').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(RepositoryError);
    expect((err as Error).message).toBe('The data operation failed');
    expect((err as Error).cause).toBeUndefined();
    expect(JSON.stringify(logged.mock.calls)).not.toContain('secret@');
    logged.mockRestore();
  });

  it('connects by itself on first use', async () => {
    server = await startMongoTestServer();
    expect(mongoose.connection.readyState).toBe(mongoose.ConnectionStates.disconnected);

    const created = await repo.create({ email: 'a@example.com', passwordHash: PASSWORD_HASH });

    expect(mongoose.connection.readyState).toBe(mongoose.ConnectionStates.connected);
    expect(mongoose.connection.name).toBe(server.dbName);
    expect((await repo.findById(created.id))?.email).toBe('a@example.com');
  });
});
