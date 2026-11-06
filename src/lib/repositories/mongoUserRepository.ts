import 'server-only';
import { connectToDatabase } from '@/lib/db';
import { normalizeEmail } from '@/lib/validation/authValidation';
import { User } from '@/models/User';
import { CreateUserDTO, UserRecord, UserWithoutPassword } from '@/types/user';
import { DuplicateEmailError, RepositoryError } from './repositoryErrors';
import { IUserRepository } from './userRepository';

// Stored IDs are 24 hex characters, so anything else can't match and never reaches a query.
const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

// Named fields rather than the default, so a new schema field stays out until added here.
const FIELDS_WITHOUT_PASSWORD = 'email name createdAt updatedAt';

function isObjectIdString(id: unknown): id is string {
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
async function withDatabase<T>(operation: () => Promise<T>): Promise<T> {
  try {
    await connectToDatabase();
    return await operation();
  } catch (err) {
    throw isDuplicateEmail(err) ? new DuplicateEmailError() : new RepositoryError();
  }
}

export class MongoUserRepository implements IUserRepository {
  async findByEmail(email: string): Promise<UserRecord | null> {
    return withDatabase(async () => {
      const user = await User.findOne({ email: normalizeEmail(email) })
        .select('+passwordHash')
        .lean();
      if (!user) {
        return null;
      }
      return {
        id: user._id.toString(),
        email: user.email,
        // The hash was selected, so a missing value means the account has no password.
        passwordHash: user.passwordHash ?? null,
        name: user.name ?? null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    });
  }

  async findById(id: string): Promise<UserWithoutPassword | null> {
    if (!isObjectIdString(id)) {
      return null;
    }
    return withDatabase(async () => {
      const user = await User.findById(id).select(FIELDS_WITHOUT_PASSWORD).lean();
      if (!user) {
        return null;
      }
      return {
        id: user._id.toString(),
        email: user.email,
        name: user.name ?? null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    });
  }

  async create(data: CreateUserDTO): Promise<UserRecord> {
    return withDatabase(async () => {
      const user = await User.create({
        email: normalizeEmail(data.email),
        passwordHash: data.passwordHash,
        name: data.name ?? undefined,
      });
      return {
        id: user._id.toString(),
        email: user.email,
        passwordHash: user.passwordHash ?? null,
        name: user.name ?? null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    });
  }

  async deleteById(id: string): Promise<boolean> {
    if (!isObjectIdString(id)) {
      return false;
    }
    return withDatabase(async () => {
      const { deletedCount } = await User.deleteOne({ _id: id });
      return deletedCount === 1;
    });
  }
}
