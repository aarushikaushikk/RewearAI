import 'server-only';
import { connectToDatabase } from '@/lib/db';
import { DuplicateEmailError, RepositoryError } from './repositoryErrors';

// Stored IDs are 24 hex characters, so anything else can't match and never reaches a query.
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

export function isObjectIdString(id: unknown): id is string {
  return typeof id === 'string' && OBJECT_ID_PATTERN.test(id);
}

function isDuplicateEmail(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    err.code === 11000 &&
    'keyPattern' in err &&
    typeof err.keyPattern === 'object' &&
    err.keyPattern !== null &&
    'email' in err.keyPattern
  );
}

/**
 * Connects, runs the operation, and replaces any failure with an error that has
 * a fixed message, because driver errors can contain hosts and user emails.
 * The shared mapping in Step 7 will replace this and report outages separately.
 */
export async function withDatabase<T>(operation: () => Promise<T>): Promise<T> {
  try {
    await connectToDatabase();
    return await operation();
  } catch (err) {
    throw isDuplicateEmail(err) ? new DuplicateEmailError() : new RepositoryError();
  }
}
