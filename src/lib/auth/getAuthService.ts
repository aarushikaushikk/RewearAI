import { AuthService } from '@/services/authService';
import { IUserRepository } from '@/lib/repositories/userRepository';
import { ISessionRepository } from '@/lib/repositories/sessionRepository';
import { MongoSessionRepository } from '@/lib/repositories/mongoSessionRepository';
import { MongoUserRepository } from '@/lib/repositories/mongoUserRepository';

export class ConfigurationError extends Error {
  constructor(message: string = 'Authentication service is temporarily unavailable') {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Creates an AuthService instance from provided repositories.
 * Used for isolated automated testing and clean dependency injection.
 */
export function createAuthService(dependencies: {
  userRepo: IUserRepository;
  sessionRepo: ISessionRepository;
}): AuthService {
  return new AuthService(dependencies.userRepo, dependencies.sessionRepo);
}

/**
 * Returns an AuthService backed by MongoDB. Fails closed if MONGODB_URI isn't set:
 * there is no in-memory fallback. Only builds objects; connecting happens on first use.
 *
 * Next.js bundles pages and route handlers separately, so each has its own copy
 * of AuthError. The connection is cached on globalThis, but the AuthService
 * instance must not be: its errors would fail `instanceof AuthError` in another
 * bundle and turn expected 4xx responses into 500s.
 */
export function getProductionAuthService(): AuthService {
  if (!process.env.MONGODB_URI?.trim()) {
    throw new ConfigurationError();
  }
  return new AuthService(new MongoUserRepository(), new MongoSessionRepository());
}

/**
 * Alias for getProductionAuthService.
 */
export const getAuthService = getProductionAuthService;
