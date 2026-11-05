import { IUserRepository } from '@/lib/repositories/userRepository';
import { ISessionRepository } from '@/lib/repositories/sessionRepository';
import {
  DuplicateEmailError,
  RepositoryUnavailableError,
} from '@/lib/repositories/repositoryErrors';
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
import { SESSION_DURATION_MS } from '@/lib/auth/sessionConfig';

export { SESSION_DURATION_MS };

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
        name: input.name?.trim() || null,
      });
    } catch (err: unknown) {
      // Reached when a concurrent request registers the same email after the check above.
      if (err instanceof DuplicateEmailError) {
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
    } catch (sessionError) {
      const statusCode = sessionError instanceof RepositoryUnavailableError ? 503 : 500;

      if (await this.rollBackNewUser(user.id)) {
        // Report failure cleanly so the user can retry without a 409 conflict
        throw new AuthError(
          'Registration failed during session initialization. Please try again.',
          'REGISTRATION_SESSION_FAILED',
          statusCode
        );
      }

      // The account remains and its password works, so direct the user to sign in
      throw new AuthError(
        'Account registered successfully, but automatic sign-in failed. Please sign in with your credentials.',
        'ACCOUNT_CREATED_SESSION_FAILED',
        statusCode
      );
    }

    return {
      user: toSafeUser(user),
      sessionToken,
      expiresAt,
    };
  }

  /**
   * Removes an account whose first session could not be created, and reports
   * whether it is gone. Never throws, because it runs while handling a failure.
   *
   * It reports false when the account can't be confirmed gone, including when the
   * database is down for both the delete and the check. A delete that applied but
   * whose reply was lost also lands here: the user is told to sign in, that fails,
   * and registering again then succeeds.
   */
  private async rollBackNewUser(userId: string): Promise<boolean> {
    try {
      if (await this.userRepo.deleteById?.(userId)) {
        return true;
      }
    } catch {
      // Fall through and check whether the account remains
    }

    try {
      return (await this.userRepo.findById(userId)) === null;
    } catch {
      return false;
    }
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

    // Timing attack mitigation: always execute bcrypt verification, using a precomputed dummy hash
    // if the user does not exist or has no password. This avoids timing discrepancies between accounts.
    const passwordHash = user?.passwordHash ?? null;
    const isValidPassword = await verifyPassword(input.password, passwordHash ?? DUMMY_PASSWORD_HASH);

    // The dummy hash must never authenticate anyone, so a missing hash fails regardless of the comparison.
    if (!user || !passwordHash || !isValidPassword) {
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
