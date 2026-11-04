import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryUserRepository } from '../../mocks/memoryUserRepository';
import { MemorySessionRepository } from '../../mocks/memorySessionRepository';

describe('Repository Contracts (In-Memory Reference Implementation)', () => {
  let userRepo: MemoryUserRepository;
  let sessionRepo: MemorySessionRepository;

  beforeEach(() => {
    userRepo = new MemoryUserRepository();
    sessionRepo = new MemorySessionRepository();
  });

  describe('IUserRepository Contract', () => {
    it('creates a user with normalized email', async () => {
      const user = await userRepo.create({
        email: '  NewUser@Domain.Com ',
        passwordHash: '$2a$10$dummyhashvalue',
        name: 'Test User',
      });

      expect(user.id).toBeDefined();
      expect(user.email).toBe('newuser@domain.com');
      expect(user.name).toBe('Test User');
      expect(user.createdAt).toBeInstanceOf(Date);
    });

    it('finds user by email case-insensitively', async () => {
      await userRepo.create({
        email: 'user@example.com',
        passwordHash: '$2a$10$dummyhashvalue',
      });

      const found = await userRepo.findByEmail('USER@EXAMPLE.COM');
      expect(found).not.toBeNull();
      expect(found?.email).toBe('user@example.com');
    });

    it('returns null when user is not found', async () => {
      const found = await userRepo.findByEmail('nonexistent@example.com');
      expect(found).toBeNull();
    });

    it('enforces email uniqueness', async () => {
      await userRepo.create({
        email: 'duplicate@example.com',
        passwordHash: 'hash1',
      });

      await expect(
        userRepo.create({
          email: 'duplicate@example.com',
          passwordHash: 'hash2',
        })
      ).rejects.toThrow('User with this email already exists');
    });
  });

  describe('ISessionRepository Contract', () => {
    it('creates a session with token hash and expiry', async () => {
      const future = new Date(Date.now() + 1000 * 60 * 60);
      const session = await sessionRepo.createSession({
        userId: 'user_123',
        tokenHash: 'abc123sha256hash',
        expiresAt: future,
      });

      expect(session.id).toBeDefined();
      expect(session.userId).toBe('user_123');
      expect(session.tokenHash).toBe('abc123sha256hash');
      expect(session.revokedAt).toBeNull();
    });

    it('finds an active unrevoked session by token hash', async () => {
      const future = new Date(Date.now() + 1000 * 60 * 60);
      await sessionRepo.createSession({
        userId: 'user_123',
        tokenHash: 'validtokenhash',
        expiresAt: future,
      });

      const active = await sessionRepo.findActiveSessionByTokenHash('validtokenhash');
      expect(active).not.toBeNull();
      expect(active?.userId).toBe('user_123');
    });

    it('does not find an expired session', async () => {
      const past = new Date(Date.now() - 1000);
      await sessionRepo.createSession({
        userId: 'user_123',
        tokenHash: 'expiredtokenhash',
        expiresAt: past,
      });

      const active = await sessionRepo.findActiveSessionByTokenHash('expiredtokenhash');
      expect(active).toBeNull();
    });

    it('revokes a session and verifies it is no longer active', async () => {
      const future = new Date(Date.now() + 1000 * 60 * 60);
      await sessionRepo.createSession({
        userId: 'user_123',
        tokenHash: 'token_to_revoke',
        expiresAt: future,
      });

      const revoked = await sessionRepo.revokeSessionByTokenHash('token_to_revoke');
      expect(revoked).toBe(true);

      const active = await sessionRepo.findActiveSessionByTokenHash('token_to_revoke');
      expect(active).toBeNull();
    });

    it('revokes all sessions for a user upon logout all', async () => {
      const future = new Date(Date.now() + 1000 * 60 * 60);
      await sessionRepo.createSession({
        userId: 'user_multi',
        tokenHash: 'hash1',
        expiresAt: future,
      });
      await sessionRepo.createSession({
        userId: 'user_multi',
        tokenHash: 'hash2',
        expiresAt: future,
      });

      const count = await sessionRepo.revokeAllSessionsForUser('user_multi');
      expect(count).toBe(2);

      expect(await sessionRepo.findActiveSessionByTokenHash('hash1')).toBeNull();
      expect(await sessionRepo.findActiveSessionByTokenHash('hash2')).toBeNull();
    });
  });
});
