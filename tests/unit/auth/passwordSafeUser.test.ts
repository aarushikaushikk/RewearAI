import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService, toSafeUser } from '@/services/authService';
import { handleGetSession } from '@/lib/auth/authHandlers';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';
import { MemoryUserRepository } from '../../mocks/memoryUserRepository';
import { MemorySessionRepository } from '../../mocks/memorySessionRepository';

const INPUT = { email: 'person@example.com', password: 'Password123!' };

describe('Password hash handling across the auth flow', () => {
  let userRepo: MemoryUserRepository;
  let service: AuthService;
  let storedHash: string;
  let sessionToken: string;

  beforeEach(async () => {
    userRepo = new MemoryUserRepository();
    service = new AuthService(userRepo, new MemorySessionRepository());
    ({ sessionToken } = await service.register(INPUT));
    storedHash = (await userRepo.findByEmail(INPUT.email))!.passwordHash!;
  });

  it('validates a session using a user loaded without the hash', async () => {
    const findById = vi.spyOn(userRepo, 'findById');

    const auth = await service.validateSession(sessionToken);

    expect(auth?.user.email).toBe(INPUT.email);
    expect(findById).toHaveBeenCalledTimes(1);
    expect(await findById.mock.results[0].value).not.toHaveProperty('passwordHash');
  });

  it('keeps the hash out of the validated session', async () => {
    const auth = await service.validateSession(sessionToken);

    expect(auth?.user).not.toHaveProperty('passwordHash');
    expect(auth?.session).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(auth)).not.toContain(storedHash);
  });

  it('keeps the hash out of the session API response', async () => {
    const res = await handleGetSession(
      new Request('http://localhost:3000/api/auth/session', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${sessionToken}` },
      }),
      { authService: service },
    );

    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain(storedHash);
  });

  it('builds a SafeUser with no hash even if given a full record', async () => {
    const full = await userRepo.findByEmail(INPUT.email);

    expect(toSafeUser(full!)).not.toHaveProperty('passwordHash');
  });

  it('still signs in with the password after a session has been validated', async () => {
    await service.validateSession(sessionToken);

    await expect(service.login(INPUT)).resolves.toMatchObject({ user: { email: INPUT.email } });
    await expect(service.login({ ...INPUT, password: 'WrongPassword123!' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('still detects an account that remains after a failed rollback', async () => {
    const sessions = new MemorySessionRepository();
    vi.spyOn(sessions, 'createSession').mockRejectedValue(new Error('session write failed'));
    vi.spyOn(userRepo, 'deleteById').mockImplementation(async () => false);

    await expect(
      new AuthService(userRepo, sessions).register({ ...INPUT, email: 'other@example.com' }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_CREATED_SESSION_FAILED' });
    expect(await userRepo.findByEmail('other@example.com')).not.toBeNull();
  });
});
