/**
 * Errors that repository implementations throw in place of driver errors.
 *
 * Constructors take no arguments and nothing is attached as a cause, because
 * driver errors can contain database hosts, credentials, and user emails.
 */
export class RepositoryError extends Error {
  override name = 'RepositoryError';

  constructor() {
    super('The data operation failed');
  }
}

/** The database could not be reached, so the request may succeed later. */
export class RepositoryUnavailableError extends RepositoryError {
  override name = 'RepositoryUnavailableError';
  override message = 'The data store is unavailable';
}

/** The provider identity is already linked, or the user already has a link for that provider. */
export class DuplicateAccountError extends RepositoryError {
  override name = 'DuplicateAccountError';
  override message = 'This account link already exists';
}

/** A user with this ID exists, which is expected when concurrent requests finish one sign-up. */
export class DuplicateUserIdError extends RepositoryError {
  override name = 'DuplicateUserIdError';
  override message = 'A user with this ID already exists';
}

/** The email is already registered, including when concurrent requests race. */
export class DuplicateEmailError extends RepositoryError {
  override name = 'DuplicateEmailError';
  override message = 'User with this email already exists';
}
