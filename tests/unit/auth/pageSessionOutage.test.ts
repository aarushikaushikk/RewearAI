import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as nextHeaders from 'next/headers';
import { AuthService } from '@/services/authService';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';
import { redirectIfAuthenticated, requirePageSession } from '@/lib/auth/pageSession';
import { RepositoryUnavailableError } from '@/lib/repositories/repositoryErrors';
import { MemoryUserRepository } from '../../mocks/memoryUserRepository';
import { MemorySessionRepository } from '../../mocks/memorySessionRepository';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));

describe('pages during a database outage', () => {
  let authService: AuthService;

  beforeEach(() => {
    const sessionRepo = new MemorySessionRepository();
    vi.spyOn(sessionRepo, 'findActiveSessionByTokenHash').mockRejectedValue(
      new RepositoryUnavailableError(),
    );
    authService = new AuthService(new MemoryUserRepository(), sessionRepo);
    vi.mocked(nextHeaders.cookies).mockResolvedValue({
      get: (name: string) =>
        name === SESSION_COOKIE_NAME ? { name, value: 'some-token' } : undefined,
    } as never);
  });

  it('sends a private page to the error boundary instead of signing the user out', async () => {
    await expect(requirePageSession(authService)).rejects.toBeInstanceOf(
      RepositoryUnavailableError,
    );
  });

  it('keeps the sign-in page reachable and reports the outage', async () => {
    await expect(redirectIfAuthenticated(authService)).resolves.toEqual({
      serviceUnavailable: true,
    });
  });
});
