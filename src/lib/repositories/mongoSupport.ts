import 'server-only';
import { connectToDatabase } from '@/lib/db';
import {
  DuplicateEmailError,
  RepositoryError,
  RepositoryUnavailableError,
} from './repositoryErrors';

// Stored IDs are 24 hex characters, so anything else can't match and never reaches a query.
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

export function isObjectIdString(id: unknown): id is string {
  return typeof id === 'string' && OBJECT_ID_PATTERN.test(id);
}

export type RepositoryOperation =
  | 'user.findByEmail'
  | 'user.findById'
  | 'user.create'
  | 'user.deleteById'
  | 'session.create'
  | 'session.findActive'
  | 'session.revoke'
  | 'session.revokeAll';

export type ErrorCategory =
  | 'connection'
  | 'network'
  | 'failover'
  | 'duplicate_email'
  | 'duplicate_key'
  | 'validation'
  | 'unknown';

const DUPLICATE_KEY_CODE = 11000;

const NETWORK_ERROR_NAMES = new Set([
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoServerSelectionError',
  'MongooseServerSelectionError',
  'MongoNotConnectedError',
  'MongoTopologyClosedError',
  'MongoPoolClearedError',
  'MongoWaitQueueTimeoutError',
  'MongoExpiredSessionError',
]);

// Server codes meaning this node can't serve the request right now, as during a failover.
const FAILOVER_CODES = new Set([6, 7, 89, 91, 189, 9001, 10107, 11600, 11602, 13435, 13436]);

const VALIDATION_ERROR_NAMES = new Set(['ValidationError', 'CastError']);

function isEmailIndexOnly(keyPattern: unknown): boolean {
  if (typeof keyPattern !== 'object' || keyPattern === null) {
    return false;
  }
  const fields = Object.keys(keyPattern);
  return fields.length === 1 && fields[0] === 'email';
}

/**
 * Sorts a failure into a fixed category. Only the error's name, code, and index
 * fields are read, and nothing from the error itself is ever part of the result.
 */
export function categorizeError(err: unknown): ErrorCategory {
  if (typeof err !== 'object' || err === null) {
    return 'unknown';
  }
  const name = 'name' in err ? err.name : undefined;
  const code = 'code' in err ? err.code : undefined;

  if (name === 'DatabaseConnectionError') {
    return 'connection';
  }
  if (typeof name === 'string' && NETWORK_ERROR_NAMES.has(name)) {
    return 'network';
  }
  if (name === 'MongoServerError' && typeof code === 'number' && FAILOVER_CODES.has(code)) {
    return 'failover';
  }
  if (code === DUPLICATE_KEY_CODE) {
    return 'keyPattern' in err && isEmailIndexOnly(err.keyPattern)
      ? 'duplicate_email'
      : 'duplicate_key';
  }
  if (typeof name === 'string' && VALIDATION_ERROR_NAMES.has(name)) {
    return 'validation';
  }
  return 'unknown';
}

function errorForCategory(category: ErrorCategory): RepositoryError {
  switch (category) {
    case 'connection':
    case 'network':
    case 'failover':
      return new RepositoryUnavailableError();
    case 'duplicate_email':
      return new DuplicateEmailError();
    default:
      return new RepositoryError();
  }
}

/** Builds a new error with a fixed message; driver errors can contain hosts and user emails. */
export function toRepositoryError(err: unknown): RepositoryError {
  return errorForCategory(categorizeError(err));
}

/**
 * Connects, runs the operation, and replaces any failure with a repository error.
 * Logs only fixed values. A duplicate email isn't logged, because it is an expected result.
 */
export async function withDatabase<T>(
  operation: RepositoryOperation,
  run: () => Promise<T>,
): Promise<T> {
  try {
    await connectToDatabase();
    return await run();
  } catch (err) {
    const category = categorizeError(err);
    if (category !== 'duplicate_email') {
      console.error('[repository] operation failed', { operation, category });
    }
    throw errorForCategory(category);
  }
}
