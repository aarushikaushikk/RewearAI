import 'server-only';
import { SESSION_DURATION_MS } from '@/lib/auth/sessionConfig';
import { generateOpaqueToken, hashToken } from '@/lib/auth/sessionTokens';
import { IAccountRepository, isProviderAccountId } from '@/lib/repositories/accountRepository';
import {
  DuplicateAccountError,
  DuplicateEmailError,
  DuplicateUserIdError,
  RepositoryError,
} from '@/lib/repositories/repositoryErrors';
import { ISessionRepository } from '@/lib/repositories/sessionRepository';
import { IUserRepository } from '@/lib/repositories/userRepository';
import { normalizeEmail, validateEmail } from '@/lib/validation/authValidation';
import { toSafeUser } from '@/services/authService';
import { LinkedAccountRecord } from '@/types/linkedAccount';
import { SafeUser, UserWithoutPassword } from '@/types/user';

const PROVIDER = 'google';
const MAX_NAME_LENGTH = 100; // The User model's limit

/**
 * Claims from an ID token that has already been verified against Google. Only the server's
 * OIDC code may produce these; they must never be built from a request's own values.
 */
export interface VerifiedGoogleClaims {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string | null;
}

export type GoogleSignInRefusal = 'invalid-identity' | 'email-not-verified' | 'email-in-use';

export type GoogleSignInResult =
  | { status: 'signed-in'; user: SafeUser; sessionToken: string; expiresAt: Date }
  | { status: 'refused'; reason: GoogleSignInRefusal };

function cleanName(name: unknown): string | null {
  if (typeof name !== 'string') {
    return null;
  }
  return name.trim().slice(0, MAX_NAME_LENGTH).trim() || null;
}

/**
 * Signs in with a verified Google identity, creating a passwordless user the first time.
 *
 * A Google identity is only ever connected to a user created for it. An Account is written
 * first, with a newly generated user ID, and then the User with that ID. A matching email
 * can therefore only cause a refusal, never a link to an existing user.
 *
 * This holds however requests overlap, because a link is never removed here:
 * - The unique index gives each identity one Account, and so one user ID, permanently.
 * - That Account exists before its User, so a User can't be left without one.
 * - Requests for one identity all write the same ID, so one wins and the rest use its User.
 *
 * An interrupted or refused sign-up can leave an Account with no User. It gives no access
 * and reserves no email, and the same identity's next sign-in finishes it if the email is free.
 * Removing it here would not be safe: another request may be about to write its User, which
 * would then be stranded with no link and, since nothing links by email, could never sign in.
 */
export class GoogleSignInService {
  constructor(
    private userRepo: IUserRepository,
    private accountRepo: IAccountRepository,
    private sessionRepo: ISessionRepository,
  ) {}

  async signIn(claims: VerifiedGoogleClaims): Promise<GoogleSignInResult> {
    if (claims.emailVerified !== true) {
      return { status: 'refused', reason: 'email-not-verified' };
    }
    if (
      !isProviderAccountId(claims.sub) ||
      typeof claims.email !== 'string' ||
      !validateEmail(claims.email).isValid
    ) {
      return { status: 'refused', reason: 'invalid-identity' };
    }

    const account = await this.findOrCreateAccount(claims);
    if (!account) {
      return { status: 'refused', reason: 'email-in-use' };
    }

    const user =
      (await this.userRepo.findById(account.userId)) ??
      (await this.createUser(account.userId, claims));
    if (!user) {
      return { status: 'refused', reason: 'email-in-use' };
    }

    return this.createSession(user);
  }

  /** Returns null if the email belongs to someone else, in which case nothing is written. */
  private async findOrCreateAccount(
    claims: VerifiedGoogleClaims,
  ): Promise<LinkedAccountRecord | null> {
    const existing = await this.accountRepo.findByProvider(PROVIDER, claims.sub);
    if (existing) {
      return existing;
    }

    if (await this.userRepo.findByEmail(normalizeEmail(claims.email))) {
      // This email check can see a User written by another request for this same identity,
      // which wrote its Account first. Looking again tells that apart from someone else's.
      return this.accountRepo.findByProvider(PROVIDER, claims.sub);
    }

    try {
      return await this.accountRepo.create({
        userId: this.userRepo.newId(),
        provider: PROVIDER,
        providerAccountId: claims.sub,
      });
    } catch (err) {
      if (!(err instanceof DuplicateAccountError)) {
        throw err;
      }
      const winner = await this.accountRepo.findByProvider(PROVIDER, claims.sub);
      if (!winner) {
        throw new RepositoryError();
      }
      return winner;
    }
  }

  /** Returns null if the email belongs to someone else. */
  private async createUser(
    id: string,
    claims: VerifiedGoogleClaims,
  ): Promise<UserWithoutPassword | null> {
    try {
      return await this.userRepo.createWithoutPassword({
        id,
        email: claims.email,
        name: cleanName(claims.name),
      });
    } catch (err) {
      if (err instanceof DuplicateUserIdError) {
        // Another request for this identity wrote the User first.
        const winner = await this.userRepo.findById(id);
        if (!winner) {
          throw new RepositoryError();
        }
        return winner;
      }
      if (err instanceof DuplicateEmailError) {
        // MongoDB may report that same race as a duplicate email rather than a duplicate ID.
        return this.userRepo.findById(id);
      }
      throw err;
    }
  }

  private async createSession(user: UserWithoutPassword): Promise<GoogleSignInResult> {
    const sessionToken = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    await this.sessionRepo.createSession({
      userId: user.id,
      tokenHash: hashToken(sessionToken),
      expiresAt,
    });

    return { status: 'signed-in', user: toSafeUser(user), sessionToken, expiresAt };
  }
}
