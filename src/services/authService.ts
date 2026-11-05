import { IUserRepository } from '@/lib/repositories/userRepository';
import { ISessionRepository } from '@/lib/repositories/sessionRepository';
import { RegisterInput, LoginInput } from '@/types/auth';
import { SafeUser, UserRecord } from '@/types/user';
import { SessionRecord } from '@/types/session';
import {
  normalizeEmail,
  validateRegisterInput,
  validateLoginInput,
} from '@/lib/validation/authValidation';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { generateOpaqueToken, hashToken } from '@/lib/auth/sessionTokens';

export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Fixed dummy bcrypt hash (cost 10) to ensure constant-time execution on unknown accounts
const DUMMY_PASSWORD_HASH = '$2b$10$zO5Yb3iT7EY9Y.smHOvRHeTPSTMqAYEm2nn.8HnOjO1F6LAl3PgZm';

export class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface AuthResult {
  user: SafeUser;
  sessionToken: string;
  expiresAt: Date;
}

export function toSafeUser(user: UserRecord): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    createdAt: user.createdAt,
  };
}

export class AuthService {
  constructor(
    private userRepo: IUserRepository,
    private sessionRepo: ISessionRepository
  ) {}

  /**
   * Registers a new user, hashes password, and creates an initial active session.
   * If session persistence fails after user creation, attempts compensating rollback.
   */
  async register(input: RegisterInput): Promise<AuthResult> {
    const validation = validateRegisterInput(input);
    if (!validation.isValid) {
      const firstErrorMessage = Object.values(validation.errors)[0] || 'Invalid registration input';
      throw new AuthError(firstErrorMessage, 'VALIDATION_ERROR', 400);
    }

    const normalized = normalizeEmail(input.email);

    // Check if user already exists
    const existing = await this.userRepo.findByEmail(normalized);
    if (existing) {
      throw new AuthError('An account with this email already exists', 'DUPLICATE_EMAIL', 409);
    }

    const passwordHash = await hashPassword(input.password);

    let user: UserRecord;
    try {
      user = await this.userRepo.create({
        email: normalized,
        passwordHash,
        name: input.name ? input.name.trim() : null,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('already exists') || msg.includes('duplicate')) {
        throw new AuthError('An account with this email already exists', 'DUPLICATE_EMAIL', 409);
      }
      throw err;
    }

    // Generate session
    const sessionToken = generateOpaqueToken();
    const tokenHash = hashToken(sessionToken);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    try {
      await this.sessionRepo.createSession({
        userId: user.id,
        tokenHash,
        expiresAt,
      });
    } catch {
      // Compensating recovery: user creation succeeded, but session persistence failed.
      // 1. Attempt rollback if repository supports deleteById
      if (typeof this.userRepo.deleteById === 'function') {
        try {
          await this.userRepo.deleteById(user.id);
        } catch {
          // Rollback failed; fall through to account-created error message
        }
      }

      // Check whether user still exists after compensation attempt
      const userStillExists = await this.userRepo.findById(user.id);
      if (!userStillExists) {
        // Rollback succeeded: cleanly report failure so user can retry safely without 409 conflict
        throw new AuthError(
          'Registration failed during session initialization. Please try again.',
          'REGISTRATION_SESSION_FAILED',
          500
        );
      }

      // Rollback was unavailable or failed: user exists in DB, so direct them to sign in
      throw new AuthError(
        'Account registered successfully, but automatic sign-in failed. Please sign in with your credentials.',
        'ACCOUNT_CREATED_SESSION_FAILED',
        500
      );
    }

    return {
      user: toSafeUser(user),
      sessionToken,
      expiresAt,
    };
  }

  /**
   * Verifies credentials and generates a new active session upon successful login.
   * Mitigates timing attacks by always performing bcrypt password verification.
   */
  async login(input: LoginInput): Promise<AuthResult> {
    const validation = validateLoginInput(input);
    if (!validation.isValid) {
      const firstErrorMessage = Object.values(validation.errors)[0] || 'Invalid login input';
      throw new AuthError(firstErrorMessage, 'VALIDATION_ERROR', 400);
    }

    const normalized = normalizeEmail(input.email);
    const user = await this.userRepo.findByEmail(normalized);

    // Timing attack mitigation: always execute bcrypt verification using a precomputed dummy hash
    // if the user does not exist. This avoids timing discrepancies between existing and non-existing accounts.
    const hashToVerify = user ? user.passwordHash : DUMMY_PASSWORD_HASH;
    const isValidPassword = await verifyPassword(input.password, hashToVerify);

    if (!user || !isValidPassword) {
      throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS', 401);
    }

    // Generate session
    const sessionToken = generateOpaqueToken();
    const tokenHash = hashToken(sessionToken);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    await this.sessionRepo.createSession({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    return {
      user: toSafeUser(user),
      sessionToken,
      expiresAt,
    };
  }

  /**
   * Revokes the active session server-side.
   */
  async logout(rawToken: string): Promise<boolean> {
    if (!rawToken || rawToken.trim().length === 0) {
      return false;
    }
    const tokenHash = hashToken(rawToken);
    return this.sessionRepo.revokeSessionByTokenHash(tokenHash);
  }

  /**
   * Validates a session token, checks revocation and expiry, and returns the safe user and session record.
   */
  async validateSession(
    rawToken: string
  ): Promise<{ user: SafeUser; session: SessionRecord } | null> {
    if (!rawToken || rawToken.trim().length === 0) {
      return null;
    }

    const tokenHash = hashToken(rawToken);
    const session = await this.sessionRepo.findActiveSessionByTokenHash(tokenHash);
    if (!session) {
      return null;
    }

    // Verify expiration and revocation
    if (session.expiresAt <= new Date() || session.revokedAt != null) {
      return null;
    }

    const user = await this.userRepo.findById(session.userId);
    if (!user) {
      return null;
    }

    return {
      user: toSafeUser(user),
      session,
    };
  }
}
