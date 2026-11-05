import { AuthService } from '@/services/authService';
import { IUserRepository } from '@/lib/repositories/userRepository';
import { ISessionRepository } from '@/lib/repositories/sessionRepository';

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
 * Returns the production AuthService instance.
 * Fails closed securely if production database adapters have not been configured.
 * Does not expose internal architecture or implementation details.
 *
 * Next.js bundles pages and route handlers separately, so each has its own copy
 * of AuthError. Cache database connections on globalThis if needed, but not the
 * AuthService instance: its errors would fail `instanceof AuthError` in another
 * bundle and turn expected 4xx responses into 500s.
 */
export function getProductionAuthService(): AuthService {
  // When teammate's MongoDB connection helper and Mongoose models are connected,
  // this factory instantiates the production adapters.
  // In the interim, it fails closed to prevent unpersisted/insecure fallback.
  throw new ConfigurationError('Authentication service is temporarily unavailable');
}

/**
 * Alias for getProductionAuthService.
 */
export const getAuthService = getProductionAuthService;
