import { AUTH_PROVIDERS, AuthProvider } from '@/types/account';
import { CreateLinkedAccountDTO, LinkedAccountRecord } from '@/types/linkedAccount';

// OpenID Connect limits `sub` to 255 ASCII characters. Whitespace is refused too, because
// the model trims this field, so a padded value could otherwise match another identity.
const PROVIDER_ACCOUNT_ID_PATTERN = /^[\x21-\x7e]{1,255}$/;

export function isAuthProvider(provider: unknown): provider is AuthProvider {
  return (AUTH_PROVIDERS as readonly unknown[]).includes(provider);
}

/** Also keeps objects such as { $ne: null } out of queries, where they would run as operators. */
export function isProviderAccountId(id: unknown): id is string {
  return typeof id === 'string' && PROVIDER_ACCOUNT_ID_PATTERN.test(id);
}

export interface IAccountRepository {
  findByProvider(
    provider: AuthProvider,
    providerAccountId: string,
  ): Promise<LinkedAccountRecord | null>;
  /** Throws DuplicateAccountError if the identity or the user's link for this provider exists. */
  create(data: CreateLinkedAccountDTO): Promise<LinkedAccountRecord>;
  /**
   * Removes a link only if it belongs to this user. Sign-in must not use this: another request
   * may be about to write that user, which would be stranded with no link. It's for cleanup
   * that runs well after any request could still be in progress.
   */
  deleteLink(provider: AuthProvider, providerAccountId: string, userId: string): Promise<boolean>;
}
