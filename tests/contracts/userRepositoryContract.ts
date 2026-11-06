import { describe, it, expect, beforeEach } from 'vitest';
import { IUserRepository } from '@/lib/repositories/userRepository';
import { DuplicateEmailError } from '@/lib/repositories/repositoryErrors';
import { OTHER_PASSWORD_HASH, PASSWORD_HASH } from './fixtures';

const HASH = PASSWORD_HASH;

export interface UserContractSetup {
  /** Returns an empty repository. */
  newRepository(): Promise<IUserRepository> | IUserRepository;
  /** An ID in this repository's format that belongs to no user. */
  unknownId: string;
}

/**
 * Behaviour every IUserRepository must have. The MongoDB adapter will run this
 * same suite, so it must not depend on how a repository stores its records.
 */
export function describeUserRepositoryContract(name: string, setup: UserContractSetup): void {
  describe(`IUserRepository contract: ${name}`, () => {
    let repo: IUserRepository;

    beforeEach(async () => {
      repo = await setup.newRepository();
    });

    describe('create', () => {
      it('returns the stored record with a string ID and timestamps', async () => {
        const user = await repo.create({ email: 'a@example.com', passwordHash: HASH, name: 'A' });

        expect(typeof user.id).toBe('string');
        expect(user.id.length).toBeGreaterThan(0);
        expect(user).toMatchObject({ email: 'a@example.com', passwordHash: HASH, name: 'A' });
        expect(user.createdAt).toBeInstanceOf(Date);
        expect(user.updatedAt).toBeInstanceOf(Date);
      });

      it('normalizes the email', async () => {
        const user = await repo.create({ email: '  MixedCase@Example.COM ', passwordHash: HASH });

        expect(user.email).toBe('mixedcase@example.com');
      });

      it.each([undefined, null])('returns a null name when given %j', async (name) => {
        const user = await repo.create({ email: 'a@example.com', passwordHash: HASH, name });

        expect(user.name).toBeNull();
      });

      it('gives each user a different ID', async () => {
        const first = await repo.create({ email: 'a@example.com', passwordHash: HASH });
        const second = await repo.create({ email: 'b@example.com', passwordHash: HASH });

        expect(first.id).not.toBe(second.id);
      });

      it.each(['a@example.com', 'A@EXAMPLE.COM'])(
        'rejects a repeated email (%s) with DuplicateEmailError',
        async (email) => {
          await repo.create({ email: 'a@example.com', passwordHash: HASH });

          await expect(repo.create({ email, passwordHash: OTHER_PASSWORD_HASH })).rejects.toBeInstanceOf(
            DuplicateEmailError,
          );
        },
      );

      it('leaves the first account unchanged after a rejected duplicate', async () => {
        const first = await repo.create({ email: 'a@example.com', passwordHash: HASH, name: 'A' });

        await repo
          .create({ email: 'a@example.com', passwordHash: OTHER_PASSWORD_HASH, name: 'B' })
          .catch(() => undefined);

        expect(await repo.findByEmail('a@example.com')).toMatchObject({
          id: first.id,
          passwordHash: HASH,
          name: 'A',
        });
      });

      it('lets exactly one of several concurrent registrations succeed', async () => {
        const results = await Promise.allSettled(
          Array.from({ length: 10 }, () =>
            repo.create({ email: 'race@example.com', passwordHash: HASH }),
          ),
        );

        const rejected = results.filter((r) => r.status === 'rejected');
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        for (const result of rejected) {
          expect((result as PromiseRejectedResult).reason).toBeInstanceOf(DuplicateEmailError);
        }
      });
    });

    describe('findByEmail', () => {
      it('finds a user regardless of email case', async () => {
        const user = await repo.create({ email: 'a@example.com', passwordHash: HASH });

        expect((await repo.findByEmail('A@Example.Com'))?.id).toBe(user.id);
      });

      it('includes the password hash, which sign-in needs', async () => {
        await repo.create({ email: 'a@example.com', passwordHash: HASH });

        expect((await repo.findByEmail('a@example.com'))?.passwordHash).toBe(HASH);
      });

      it('returns null for an unknown email', async () => {
        expect(await repo.findByEmail('nobody@example.com')).toBeNull();
      });
    });

    describe('findById', () => {
      it('returns the matching user only', async () => {
        const first = await repo.create({ email: 'a@example.com', passwordHash: HASH });
        await repo.create({ email: 'b@example.com', passwordHash: HASH });

        expect(await repo.findById(first.id)).toMatchObject({
          id: first.id,
          email: 'a@example.com',
        });
      });

      it('returns null for an unknown ID', async () => {
        expect(await repo.findById(setup.unknownId)).toBeNull();
      });

      it.each(['user_1', 'not-an-id', '', '123456789012'])(
        'returns null rather than throwing for the malformed ID %j',
        async (id) => {
          await expect(repo.findById(id)).resolves.toBeNull();
        },
      );
    });

    describe('deleteById', () => {
      it('is implemented, because registration rollback needs it', () => {
        expect(typeof repo.deleteById).toBe('function');
      });

      it('removes only the given user', async () => {
        const first = await repo.create({ email: 'a@example.com', passwordHash: HASH });
        const second = await repo.create({ email: 'b@example.com', passwordHash: HASH });

        expect(await repo.deleteById?.(first.id)).toBe(true);

        expect(await repo.findById(first.id)).toBeNull();
        expect((await repo.findById(second.id))?.id).toBe(second.id);
      });

      it('frees the email for a later registration', async () => {
        const user = await repo.create({ email: 'a@example.com', passwordHash: HASH });
        await repo.deleteById?.(user.id);

        await expect(
          repo.create({ email: 'a@example.com', passwordHash: HASH }),
        ).resolves.toBeDefined();
      });

      it.each(['unknown', 'malformed'])('returns false for a %s ID', async (kind) => {
        const id = kind === 'unknown' ? setup.unknownId : 'user_1';

        await expect(repo.deleteById?.(id)).resolves.toBe(false);
      });
    });
  });
}
