import 'server-only';
import { ConfigurationError } from '@/lib/auth/getAuthService';
import { MongoAccountRepository } from '@/lib/repositories/mongoAccountRepository';
import { MongoSessionRepository } from '@/lib/repositories/mongoSessionRepository';
import { MongoUserRepository } from '@/lib/repositories/mongoUserRepository';
import { GoogleSignInService } from '@/services/googleSignInService';

/** Fails closed if MONGODB_URI isn't set. Not cached, as with getProductionAuthService. */
export function getGoogleSignInService(): GoogleSignInService {
  if (!process.env.MONGODB_URI?.trim()) {
    throw new ConfigurationError();
  }
  return new GoogleSignInService(
    new MongoUserRepository(),
    new MongoAccountRepository(),
    new MongoSessionRepository(),
  );
}
