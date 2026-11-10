import 'server-only';
import type { Connection } from 'mongoose';
import { connectToDatabase } from '@/lib/db';
import { ensureRequiredIndexes } from './mongoIndexes';
import {
  DuplicateAccountError,
  DuplicateEmailError,
  DuplicateImageError,
  DuplicateUserIdError,
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
  | 'user.createWithoutPassword'
  | 'account.findByProvider'
  | 'account.create'
  | 'session.create'
  | 'session.findActive'
  | 'session.revoke'
  | 'wardrobeItem.create'
  | 'wardrobeItem.findByImage'
  | 'wardrobeItem.findUsedImageIds'
  | 'wardrobeItem.listByOwner'
  | 'wardrobeItem.listAvailableByOwner'
  | 'wardrobeItem.findByIdForOwner'
  | 'wardrobeItem.updateForOwner'
  | 'wardrobeItem.setAvailability'
  | 'wardrobeItem.deleteForOwner';

export type ErrorCategory =
  | 'connection'
  | 'network'
  | 'failover'
  | 'index_init'
  | 'duplicate_email'
  | 'duplicate_account'
  | 'duplicate_user_id'
  | 'duplicate_image'
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

const INDEX_INITIALIZATION_ERROR = 'IndexInitializationError';

// Only these exact indexes have a meaning of their own; anything else is a plain failure.
const DUPLICATE_CATEGORIES = new Map<string, ErrorCategory>([
  ['email', 'duplicate_email'],
  ['_id', 'duplicate_user_id'],
  ['provider,providerAccountId', 'duplicate_account'],
  ['provider,userId', 'duplicate_account'],
  ['image.publicId', 'duplicate_image'],
]);

// Expected when requests race, so they aren't logged as failures.
const EXPECTED_DUPLICATES = new Set<ErrorCategory>([
  'duplicate_email',
  'duplicate_account',
  'duplicate_user_id',
  'duplicate_image',
]);

function categorizeDuplicate(keyPattern: unknown): ErrorCategory {
  if (typeof keyPattern !== 'object' || keyPattern === null) {
    return 'duplicate_key';
  }
  const fields = Object.keys(keyPattern).sort().join();
  return DUPLICATE_CATEGORIES.get(fields) ?? 'duplicate_key';
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
  if (name === INDEX_INITIALIZATION_ERROR) {
    return 'index_init';
  }
  if (typeof name === 'string' && NETWORK_ERROR_NAMES.has(name)) {
    return 'network';
  }
  if (name === 'MongoServerError' && typeof code === 'number' && FAILOVER_CODES.has(code)) {
    return 'failover';
  }
  if (code === DUPLICATE_KEY_CODE) {
    return categorizeDuplicate('keyPattern' in err ? err.keyPattern : undefined);
  }
  if (typeof name === 'string' && VALIDATION_ERROR_NAMES.has(name)) {
    return 'validation';
  }
  return 'unknown';
}

function isOutage(category: ErrorCategory): boolean {
  return category === 'connection' || category === 'network' || category === 'failover';
}

function errorForCategory(category: ErrorCategory): RepositoryError {
  if (isOutage(category)) {
    return new RepositoryUnavailableError();
  }
  switch (category) {
    case 'duplicate_email':
      return new DuplicateEmailError();
    case 'duplicate_account':
      return new DuplicateAccountError();
    case 'duplicate_user_id':
      return new DuplicateUserIdError();
    case 'duplicate_image':
      return new DuplicateImageError();
    default:
      return new RepositoryError();
  }
}

/** Builds a new error with a fixed message; driver errors can contain hosts and user emails. */
export function toRepositoryError(err: unknown): RepositoryError {
  return errorForCategory(categorizeError(err));
}

/**
 * Keeps an outage as it is, and marks anything else as an index failure. Building the
 * unique email index over stored duplicates raises the same error as registering a taken
 * email, and must not be reported to the user as one.
 */
async function ensureIndexes(connection: Connection): Promise<void> {
  try {
    await ensureRequiredIndexes(connection);
  } catch (err) {
    if (isOutage(categorizeError(err))) {
      throw err;
    }
    throw Object.assign(new Error('Index initialization failed'), {
      name: INDEX_INITIALIZATION_ERROR,
    });
  }
}

/**
 * Connects, makes sure the required indexes exist, runs the operation, and replaces any
 * failure with a repository error, so nothing runs if the indexes can't be confirmed.
 * Logs only fixed values, and not the duplicates that are an expected result.
 */
export async function withDatabase<T>(
  operation: RepositoryOperation,
  run: () => Promise<T>,
): Promise<T> {
  try {
    const { connection } = await connectToDatabase();
    await ensureIndexes(connection);
    return await run();
  } catch (err) {
    const category = categorizeError(err);
    if (!EXPECTED_DUPLICATES.has(category)) {
      console.error('[repository] operation failed', { operation, category });
    }
    throw errorForCategory(category);
  }
}
