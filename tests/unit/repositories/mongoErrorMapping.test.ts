import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { DatabaseConnectionError } from '@/lib/db';
import { categorizeError, toRepositoryError } from '@/lib/repositories/mongoSupport';
import {
  DuplicateAccountError,
  DuplicateEmailError,
  DuplicateUserIdError,
  RepositoryError,
  RepositoryUnavailableError,
} from '@/lib/repositories/repositoryErrors';

const { MongoNetworkError, MongoNetworkTimeoutError, MongoServerError, MongoNotConnectedError } =
  mongoose.mongo;

const SECRET_TEXT =
  'mongodb+srv://rewear-user:s3cr3t-pass@cluster0.abcde.mongodb.net person@example.com E11000';

function named(name: string): Error {
  return Object.assign(new Error(SECRET_TEXT), { name });
}

function serverError(fields: Record<string, unknown>) {
  return Object.assign(new MongoServerError({ message: SECRET_TEXT }), fields);
}

describe('MongoDB error mapping', () => {
  describe('outages become RepositoryUnavailableError', () => {
    it.each([
      'DatabaseConnectionError',
      'MongoNetworkError',
      'MongoNetworkTimeoutError',
      'MongoServerSelectionError',
      'MongooseServerSelectionError',
      'MongoNotConnectedError',
      'MongoTopologyClosedError',
      'MongoPoolClearedError',
      'MongoWaitQueueTimeoutError',
      'MongoExpiredSessionError',
    ])('%s', (name) => {
      expect(toRepositoryError(named(name))).toBeInstanceOf(RepositoryUnavailableError);
    });

    it.each([
      ['db.ts connection failure', new DatabaseConnectionError(), 'connection'],
      ['driver network error', new MongoNetworkError(SECRET_TEXT), 'network'],
      ['driver network timeout', new MongoNetworkTimeoutError(SECRET_TEXT), 'network'],
      ['driver not connected', new MongoNotConnectedError(SECRET_TEXT), 'network'],
    ])('recognizes the real %s class', (_name, err, category) => {
      expect(toRepositoryError(err)).toBeInstanceOf(RepositoryUnavailableError);
      expect(categorizeError(err)).toBe(category);
    });

    it.each([
      ['HostUnreachable', 6],
      ['HostNotFound', 7],
      ['NetworkTimeout', 89],
      ['ShutdownInProgress', 91],
      ['PrimarySteppedDown', 189],
      ['SocketException', 9001],
      ['NotWritablePrimary', 10107],
      ['InterruptedAtShutdown', 11600],
      ['InterruptedDueToReplStateChange', 11602],
      ['NotPrimaryNoSecondaryOk', 13435],
      ['NotPrimaryOrSecondary', 13436],
    ])('server code for %s, sent during a failover', (_name, code) => {
      const err = serverError({ code });

      expect(toRepositoryError(err)).toBeInstanceOf(RepositoryUnavailableError);
      expect(categorizeError(err)).toBe('failover');
    });

    it('does not treat the same code on an unrelated error as an outage', () => {
      const err = Object.assign(new Error(SECRET_TEXT), { code: 6 });

      expect(toRepositoryError(err)).not.toBeInstanceOf(RepositoryUnavailableError);
    });
  });

  describe('only the email index becomes DuplicateEmailError', () => {
    it('duplicate on the email index', () => {
      const err = serverError({ code: 11000, keyPattern: { email: 1 } });

      expect(toRepositoryError(err)).toBeInstanceOf(DuplicateEmailError);
      expect(categorizeError(err)).toBe('duplicate_email');
    });

    it.each([
      ['another index', { code: 11000, keyPattern: { tokenHash: 1 } }],
      ['a compound index that includes email', { code: 11000, keyPattern: { email: 1, name: 1 } }],
      ['no index details', { code: 11000 }],
      ['index details that are not an object', { code: 11000, keyPattern: 'email' }],
      ['another code', { code: 11001, keyPattern: { email: 1 } }],
    ])('not for %s', (_name, fields) => {
      const err = toRepositoryError(serverError(fields));

      expect(err).not.toBeInstanceOf(DuplicateEmailError);
      expect(err).toBeInstanceOf(RepositoryError);
    });

    it('not for an error that only mentions a duplicate email', () => {
      expect(toRepositoryError(new Error('E11000 duplicate key email'))).not.toBeInstanceOf(
        DuplicateEmailError,
      );
    });
  });

  describe('other duplicates the sign-in flow has to recognize', () => {
    it.each([
      ['an identity already linked', { provider: 1, providerAccountId: 1 }],
      ['a user already linked', { userId: 1, provider: 1 }],
    ])('%s becomes DuplicateAccountError', (_name, keyPattern) => {
      const err = serverError({ code: 11000, keyPattern });

      expect(toRepositoryError(err)).toBeInstanceOf(DuplicateAccountError);
      expect(categorizeError(err)).toBe('duplicate_account');
    });

    it('a repeated ID becomes DuplicateUserIdError', () => {
      const err = serverError({ code: 11000, keyPattern: { _id: 1 } });

      expect(toRepositoryError(err)).toBeInstanceOf(DuplicateUserIdError);
      expect(categorizeError(err)).toBe('duplicate_user_id');
    });

    it.each([
      ['only part of the identity index', { providerAccountId: 1 }],
      ['an index that adds a field', { provider: 1, providerAccountId: 1, name: 1 }],
      ['an index that adds a field to the ID', { _id: 1, email: 1 }],
    ])('not for %s', (_name, keyPattern) => {
      const err = serverError({ code: 11000, keyPattern });

      expect(toRepositoryError(err).constructor).toBe(RepositoryError);
      expect(categorizeError(err)).toBe('duplicate_key');
    });
  });

  describe('everything else becomes a plain RepositoryError', () => {
    it.each<[string, unknown, string]>([
      ['a duplicate on another index', serverError({ code: 11000, keyPattern: { a: 1 } }), 'duplicate_key'],
      ['a validation failure', named('ValidationError'), 'validation'],
      ['a cast failure', named('CastError'), 'validation'],
      ['another server error', serverError({ code: 13 }), 'unknown'],
      ['an unknown error', new Error(SECRET_TEXT), 'unknown'],
      ['a thrown string', SECRET_TEXT, 'unknown'],
      ['null', null, 'unknown'],
      ['undefined', undefined, 'unknown'],
    ])('%s', (_name, err, category) => {
      expect(toRepositoryError(err).constructor).toBe(RepositoryError);
      expect(categorizeError(err)).toBe(category);
    });

    it('an index that could not be built, even though it reports a duplicate email', () => {
      const err = named('IndexInitializationError');

      expect(toRepositoryError(err).constructor).toBe(RepositoryError);
      expect(categorizeError(err)).toBe('index_init');
    });

    it('does not take an unrecognized error name as its category', () => {
      expect(categorizeError(named(SECRET_TEXT))).toBe('unknown');
    });
  });

  describe('mapped errors carry nothing from the original', () => {
    it.each<[string, unknown]>([
      ['outage', new MongoNetworkError(SECRET_TEXT)],
      [
        'duplicate email',
        serverError({ code: 11000, keyPattern: { email: 1 }, keyValue: { email: 'person@example.com' } }),
      ],
      ['other failure', new Error(SECRET_TEXT)],
    ])('%s', (_name, original) => {
      const mapped = toRepositoryError(original);

      expect(mapped.cause).toBeUndefined();
      expect(`${mapped.message} ${mapped.stack} ${JSON.stringify(mapped)}`).not.toMatch(
        /s3cr3t|cluster0|person@|E11000/,
      );
    });
  });
});
