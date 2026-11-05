import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthError, AuthService } from '@/services/authService';
import { verifyPassword } from '@/lib/auth/password';
import { generateOpaqueToken, hashToken } from '@/lib/auth/sessionTokens';
import { MemoryUserRepository } from '../../mocks/memoryUserRepository';
import { MemorySessionRepository } from '../../mocks/memorySessionRepository';

vi.mock('@/lib/auth/password', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/password')>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});

const PASSWORDLESS_EMAIL = 'google-only@example.com';
const ATTEMPT = { email: PASSWORDLESS_EMAIL, password: 'AnyPassword123!' };

async function loginError(service: AuthService, input: { email: string; password: string }) {
  const err = await service.login(input).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AuthError);
  const { message, code, statusCode } = err as AuthError;
  return { message, code, statusCode };
}

describe('Password sign-in for an account with no password', () => {
  let userRepo: MemoryUserRepository;
  let sessionRepo: MemorySessionRepository;
  let service: AuthService;

  beforeEach(() => {
    vi.mocked(verifyPassword).mockClear();
    userRepo = new MemoryUserRepository();
    sessionRepo = new MemorySessionRepository();
    service = new AuthService(userRepo, sessionRepo);
    userRepo.addPasswordlessUserForTest(PASSWORDLESS_EMAIL);
  });

  it('gives the same failure as an unknown email and a wrong password', async () => {
    await service.register({ email: 'has-password@example.com', password: 'CorrectPassword123!' });

    const passwordless = await loginError(service, ATTEMPT);
    const unknownEmail = await loginError(service, {
      email: 'nobody@example.com',
      password: 'AnyPassword123!',
    });
    const wrongPassword = await loginError(service, {
      email: 'has-password@example.com',
      password: 'WrongPassword123!',
    });

    expect(passwordless).toEqual({
      message: 'Invalid email or password',
      code: 'INVALID_CREDENTIALS',
      statusCode: 401,
    });
    expect(passwordless).toEqual(unknownEmail);
    expect(passwordless).toEqual(wrongPassword);
  });

  it('still runs a real hash comparison, so timing does not reveal the account type', async () => {
    await loginError(service, ATTEMPT);

    expect(verifyPassword).toHaveBeenCalledTimes(1);
    expect(vi.mocked(verifyPassword).mock.calls[0][1]).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it('refuses sign-in even if the comparison against the placeholder hash succeeds', async () => {
    vi.mocked(verifyPassword).mockResolvedValueOnce(true);

    expect((await loginError(service, ATTEMPT)).code).toBe('INVALID_CREDENTIALS');
  });

  it('creates no session', async () => {
    const createSession = vi.spyOn(sessionRepo, 'createSession');
    vi.mocked(verifyPassword).mockResolvedValueOnce(true);

    await loginError(service, ATTEMPT);

    expect(createSession).not.toHaveBeenCalled();
  });

  it('keeps an existing session for that account valid, without exposing a hash', async () => {
    const user = await userRepo.findByEmail(PASSWORDLESS_EMAIL);
    const token = generateOpaqueToken();
    await sessionRepo.createSession({
      userId: user!.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const auth = await service.validateSession(token);

    expect(auth?.user.email).toBe(PASSWORDLESS_EMAIL);
    expect(auth?.user).not.toHaveProperty('passwordHash');
  });

  it('leaves email and password sign-in working', async () => {
    await service.register({ email: 'has-password@example.com', password: 'CorrectPassword123!' });

    const result = await service.login({
      email: 'has-password@example.com',
      password: 'CorrectPassword123!',
    });

    expect(result.user.email).toBe('has-password@example.com');
    expect(await service.validateSession(result.sessionToken)).not.toBeNull();
  });
});
