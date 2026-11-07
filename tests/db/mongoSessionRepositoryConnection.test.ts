import { afterAll, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoSessionRepository } from '@/lib/repositories/mongoSessionRepository';
import { RepositoryUnavailableError } from '@/lib/repositories/repositoryErrors';
import { tokenHashFor, USER_IDS } from '../contracts/fixtures';
import { errorFrom } from '../helpers/dbTestTools';
import { startMongoTestServer, type MongoTestServer } from '../helpers/mongoTestServer';

// Kept apart from the other repository tests, which connect before they start.
describe('MongoSessionRepository connection', () => {
  const repo = new MongoSessionRepository();
  const HASH = tokenHashFor('hash-1');
  let server: MongoTestServer | undefined;

  afterAll(async () => {
    await server?.stop();
  });

  it.each([
    ['createSession', () => repo.createSession({ userId: USER_IDS[0], tokenHash: HASH, expiresAt: new Date() })],
    ['findActiveSessionByTokenHash', () => repo.findActiveSessionByTokenHash(HASH)],
    ['revokeSessionByTokenHash', () => repo.revokeSessionByTokenHash(HASH)],
  ])('%s fails with a fixed message when the database cannot be reached', async (_name, run) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const err = await errorFrom(run);

    expect(err).toBeInstanceOf(RepositoryUnavailableError);
    expect(err.message).toBe('The data store is unavailable');
    expect(err.cause).toBeUndefined();
    logged.mockRestore();
  });

  it('connects by itself on first use', async () => {
    server = await startMongoTestServer();
    expect(mongoose.connection.readyState).toBe(mongoose.ConnectionStates.disconnected);

    const session = await repo.createSession({
      userId: USER_IDS[0],
      tokenHash: HASH,
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(mongoose.connection.name).toBe(server.dbName);
    expect((await repo.findActiveSessionByTokenHash(HASH))?.id).toBe(session.id);
  });
});
