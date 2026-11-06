import 'server-only';
import { normalizeEmail } from '@/lib/validation/authValidation';
import { User } from '@/models/User';
import { CreateUserDTO, UserRecord, UserWithoutPassword } from '@/types/user';
import { isObjectIdString, withDatabase } from './mongoSupport';
import { IUserRepository } from './userRepository';

// Named fields rather than the default, so a new schema field stays out until added here.
const FIELDS_WITHOUT_PASSWORD = 'email name createdAt updatedAt';

export class MongoUserRepository implements IUserRepository {
  async findByEmail(email: string): Promise<UserRecord | null> {
    return withDatabase('user.findByEmail', async () => {
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
    return withDatabase('user.findById', async () => {
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
    return withDatabase('user.create', async () => {
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
    return withDatabase('user.deleteById', async () => {
      const { deletedCount } = await User.deleteOne({ _id: id });
      return deletedCount === 1;
    });
  }
}
