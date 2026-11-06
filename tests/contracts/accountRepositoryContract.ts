import { describe, it, expect, beforeEach } from 'vitest';
import { IAccountRepository } from '@/lib/repositories/accountRepository';
import { DuplicateAccountError, RepositoryError } from '@/lib/repositories/repositoryErrors';
import { AuthProvider } from '@/types/account';

export interface AccountContractSetup {
  /** Returns an empty repository. */
  newRepository(): Promise<IAccountRepository> | IAccountRepository;
  /** Valid user IDs in this repository's format. */
  userIds: [string, string];
}

const GOOGLE: AuthProvider = 'google';
const SUB = '108000000000000000001';
const OTHER_SUB = '108000000000000000002';

const MALFORMED_IDENTITIES: [string, unknown][] = [
  ['an operator object', { $ne: null }],
  ['a value wrapped in an array', [SUB]],
  ['an empty string', ''],
  ['surrounding spaces', ` ${SUB} `],
  ['more than 255 characters', 'x'.repeat(256)],
];

/**
 * Behaviour every IAccountRepository must have. An account links one provider
 * identity to one user, and this suite runs on both memory and MongoDB.
 */
export function describeAccountRepositoryContract(name: string, setup: AccountContractSetup): void {
  describe(`IAccountRepository contract: ${name}`, () => {
    const [userA, userB] = setup.userIds;
    let repo: IAccountRepository;

    const link = (userId = userA, providerAccountId = SUB) =>
      repo.create({ userId, provider: GOOGLE, providerAccountId });

    beforeEach(async () => {
      repo = await setup.newRepository();
    });

    describe('create', () => {
      it('returns the stored link with string IDs', async () => {
        const account = await link();

        expect(typeof account.id).toBe('string');
        expect(account.id.length).toBeGreaterThan(0);
        expect(account).toMatchObject({
          userId: userA,
          provider: GOOGLE,
          providerAccountId: SUB,
        });
        expect(account.createdAt).toBeInstanceOf(Date);
      });

      it('rejects an identity already linked to another user, and keeps the first link', async () => {
        const first = await link(userA);

        await expect(link(userB)).rejects.toBeInstanceOf(DuplicateAccountError);

        expect(await repo.findByProvider(GOOGLE, SUB)).toEqual(first);
      });

      it('rejects a second identity from the same provider for one user', async () => {
        await link(userA, SUB);

        await expect(link(userA, OTHER_SUB)).rejects.toBeInstanceOf(DuplicateAccountError);

        expect(await repo.findByProvider(GOOGLE, OTHER_SUB)).toBeNull();
      });

      it('lets exactly one of several concurrent links for an identity succeed', async () => {
        const results = await Promise.allSettled(
          Array.from({ length: 10 }, (_, i) => link(i % 2 ? userA : userB)),
        );

        const rejected = results.filter((r) => r.status === 'rejected');
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        for (const result of rejected) {
          expect((result as PromiseRejectedResult).reason).toBeInstanceOf(DuplicateAccountError);
        }
      });

      it.each(MALFORMED_IDENTITIES)('rejects %s as an identity', async (_name, identity) => {
        await expect(link(userA, identity as string)).rejects.toBeInstanceOf(RepositoryError);
      });

      it('rejects a provider that is not allowed', async () => {
        await expect(
          repo.create({
            userId: userA,
            provider: 'github' as AuthProvider,
            providerAccountId: SUB,
          }),
        ).rejects.toBeInstanceOf(RepositoryError);
      });
    });

    describe('findByProvider', () => {
      it('finds a link by its provider identity', async () => {
        const account = await link();

        expect(await repo.findByProvider(GOOGLE, SUB)).toEqual(account);
      });

      it('returns null for an unknown identity', async () => {
        await link();

        expect(await repo.findByProvider(GOOGLE, OTHER_SUB)).toBeNull();
      });

      it.each(MALFORMED_IDENTITIES)('returns null for %s', async (_name, identity) => {
        await link();

        await expect(repo.findByProvider(GOOGLE, identity as string)).resolves.toBeNull();
      });

      it('returns null for a provider that is not allowed', async () => {
        await link();

        await expect(repo.findByProvider('github' as AuthProvider, SUB)).resolves.toBeNull();
      });
    });

    describe('deleteLink', () => {
      it('removes a link when the identity and user both match', async () => {
        await link();

        expect(await repo.deleteLink(GOOGLE, SUB, userA)).toBe(true);
        expect(await repo.findByProvider(GOOGLE, SUB)).toBeNull();
      });

      it("won't remove a link that belongs to another user", async () => {
        const account = await link(userA);

        expect(await repo.deleteLink(GOOGLE, SUB, userB)).toBe(false);
        expect(await repo.findByProvider(GOOGLE, SUB)).toEqual(account);
      });

      it('returns false for an unknown identity', async () => {
        expect(await repo.deleteLink(GOOGLE, SUB, userA)).toBe(false);
      });

      it.each(MALFORMED_IDENTITIES)('returns false and removes nothing for %s', async (_name, identity) => {
        await link();

        await expect(repo.deleteLink(GOOGLE, identity as string, userA)).resolves.toBe(false);
        expect(await repo.findByProvider(GOOGLE, SUB)).not.toBeNull();
      });

      it('frees the identity for a later link', async () => {
        await link(userA);
        await repo.deleteLink(GOOGLE, SUB, userA);

        await expect(link(userB)).resolves.toMatchObject({ userId: userB });
      });
    });
  });
}
