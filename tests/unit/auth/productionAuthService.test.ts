import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '@/services/authService';
import { ConfigurationError, getProductionAuthService } from '@/lib/auth/getAuthService';
import { MongoSessionRepository } from '@/lib/repositories/mongoSessionRepository';
import { MongoUserRepository } from '@/lib/repositories/mongoUserRepository';

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));

// Nothing here may reach a database: the factory only builds objects.
vi.mock('@/lib/db', () => ({ connectToDatabase: connect }));

const FAKE_URI = 'mongodb://127.0.0.1:1/rewear_test_never_connected';

describe('getProductionAuthService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['empty', ''],
    ['only spaces', '   '],
  ])('fails closed when MONGODB_URI is %s', (_name, uri) => {
    vi.stubEnv('MONGODB_URI', uri);

    expect(() => getProductionAuthService()).toThrow(ConfigurationError);
    expect(connect).not.toHaveBeenCalled();
  });

  it('fails closed when MONGODB_URI is not set', () => {
    vi.stubEnv('MONGODB_URI', undefined);

    expect(() => getProductionAuthService()).toThrow(ConfigurationError);
  });

  it('reveals nothing about the configuration when it fails', () => {
    vi.stubEnv('MONGODB_URI', '');

    expect(() => getProductionAuthService()).toThrow(
      /^Authentication service is temporarily unavailable$/,
    );
  });

  it('uses the MongoDB repositories, never in-memory ones', () => {
    vi.stubEnv('MONGODB_URI', FAKE_URI);

    const service = getProductionAuthService() as unknown as {
      userRepo: unknown;
      sessionRepo: unknown;
    };

    expect(service).toBeInstanceOf(AuthService);
    expect(service.userRepo).toBeInstanceOf(MongoUserRepository);
    expect(service.sessionRepo).toBeInstanceOf(MongoSessionRepository);
  });

  it('does not connect until an operation needs the database', () => {
    vi.stubEnv('MONGODB_URI', FAKE_URI);

    getProductionAuthService();

    expect(connect).not.toHaveBeenCalled();
  });

  it('builds a new service each time, because a shared one breaks across Next.js bundles', () => {
    vi.stubEnv('MONGODB_URI', FAKE_URI);

    expect(getProductionAuthService()).not.toBe(getProductionAuthService());
  });
});
