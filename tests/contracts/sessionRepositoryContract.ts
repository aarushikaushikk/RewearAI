import { describe, it, expect, beforeEach } from 'vitest';
import { ISessionRepository } from '@/lib/repositories/sessionRepository';

const IN_ONE_HOUR = () => new Date(Date.now() + 60 * 60 * 1000);
const ONE_SECOND_AGO = () => new Date(Date.now() - 1000);

export interface SessionContractSetup {
  /** Returns an empty repository. */
  newRepository(): Promise<ISessionRepository> | ISessionRepository;
  /** Valid user IDs in this repository's format. */
  userIds: [string, string];
}

/**
 * Behaviour every ISessionRepository must have. The MongoDB adapter will run this
 * same suite, so it must not depend on how a repository stores its records.
 */
export function describeSessionRepositoryContract(
  name: string,
  setup: SessionContractSetup,
): void {
  describe(`ISessionRepository contract: ${name}`, () => {
    const [userA, userB] = setup.userIds;
    let repo: ISessionRepository;

    const createFor = (userId: string, tokenHash: string, expiresAt = IN_ONE_HOUR()) =>
      repo.createSession({ userId, tokenHash, expiresAt });

    beforeEach(async () => {
      repo = await setup.newRepository();
    });

    describe('createSession', () => {
      it('returns the stored record, active and with string IDs', async () => {
        const expiresAt = IN_ONE_HOUR();

        const session = await createFor(userA, 'hash-1', expiresAt);

        expect(typeof session.id).toBe('string');
        expect(session.id.length).toBeGreaterThan(0);
        expect(session.userId).toBe(userA);
        expect(session.tokenHash).toBe('hash-1');
        expect(session.expiresAt.getTime()).toBe(expiresAt.getTime());
        expect(session.createdAt).toBeInstanceOf(Date);
        expect(session.revokedAt ?? null).toBeNull();
      });
    });

    describe('findActiveSessionByTokenHash', () => {
      it('finds an active session', async () => {
        const session = await createFor(userA, 'hash-1');

        const found = await repo.findActiveSessionByTokenHash('hash-1');

        expect(found?.id).toBe(session.id);
        expect(found?.userId).toBe(userA);
      });

      it('returns null for an unknown hash', async () => {
        expect(await repo.findActiveSessionByTokenHash('unknown')).toBeNull();
      });

      it('returns null for an expired session', async () => {
        await createFor(userA, 'hash-1', ONE_SECOND_AGO());

        expect(await repo.findActiveSessionByTokenHash('hash-1')).toBeNull();
      });

      it('returns null for a revoked session', async () => {
        await createFor(userA, 'hash-1');
        await repo.revokeSessionByTokenHash('hash-1');

        expect(await repo.findActiveSessionByTokenHash('hash-1')).toBeNull();
      });

      it('resolves each token to its own user', async () => {
        await createFor(userA, 'hash-a');
        await createFor(userB, 'hash-b');

        expect((await repo.findActiveSessionByTokenHash('hash-a'))?.userId).toBe(userA);
        expect((await repo.findActiveSessionByTokenHash('hash-b'))?.userId).toBe(userB);
      });
    });

    describe('revokeSessionByTokenHash', () => {
      it('returns true when it revokes a session', async () => {
        await createFor(userA, 'hash-1');

        expect(await repo.revokeSessionByTokenHash('hash-1')).toBe(true);
      });

      it('returns false for an unknown hash', async () => {
        expect(await repo.revokeSessionByTokenHash('unknown')).toBe(false);
      });

      it('returns false when the session is already revoked', async () => {
        await createFor(userA, 'hash-1');
        await repo.revokeSessionByTokenHash('hash-1');

        expect(await repo.revokeSessionByTokenHash('hash-1')).toBe(false);
      });

      it('reports exactly one success across concurrent revocations', async () => {
        await createFor(userA, 'hash-1');

        const results = await Promise.all(
          Array.from({ length: 10 }, () => repo.revokeSessionByTokenHash('hash-1')),
        );

        expect(results.filter(Boolean)).toHaveLength(1);
      });

      it("leaves the same user's other sessions active", async () => {
        await createFor(userA, 'phone');
        await createFor(userA, 'laptop');

        await repo.revokeSessionByTokenHash('phone');

        expect(await repo.findActiveSessionByTokenHash('laptop')).not.toBeNull();
      });

      it("leaves another user's sessions active", async () => {
        await createFor(userA, 'hash-a');
        await createFor(userB, 'hash-b');

        await repo.revokeSessionByTokenHash('hash-a');

        expect(await repo.findActiveSessionByTokenHash('hash-b')).not.toBeNull();
      });
    });

    describe('revokeAllSessionsForUser', () => {
      it('revokes every active session for the user and returns the count', async () => {
        await createFor(userA, 'phone');
        await createFor(userA, 'laptop');

        expect(await repo.revokeAllSessionsForUser(userA)).toBe(2);

        expect(await repo.findActiveSessionByTokenHash('phone')).toBeNull();
        expect(await repo.findActiveSessionByTokenHash('laptop')).toBeNull();
      });

      it('does not count sessions already revoked', async () => {
        await createFor(userA, 'phone');
        await createFor(userA, 'laptop');
        await repo.revokeSessionByTokenHash('phone');

        expect(await repo.revokeAllSessionsForUser(userA)).toBe(1);
      });

      it("leaves another user's sessions active", async () => {
        await createFor(userA, 'hash-a');
        await createFor(userB, 'hash-b');

        await repo.revokeAllSessionsForUser(userA);

        expect(await repo.findActiveSessionByTokenHash('hash-b')).not.toBeNull();
      });

      it('returns zero for a user with no sessions', async () => {
        expect(await repo.revokeAllSessionsForUser(userB)).toBe(0);
      });
    });
  });
}
