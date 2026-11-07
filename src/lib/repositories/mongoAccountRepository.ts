import 'server-only';
import { Account } from '@/models/Account';
import { AuthProvider } from '@/types/account';
import { CreateLinkedAccountDTO, LinkedAccountRecord } from '@/types/linkedAccount';
import { IAccountRepository, isAuthProvider, isProviderAccountId } from './accountRepository';
import { isObjectIdString, withDatabase } from './mongoSupport';
import { RepositoryError } from './repositoryErrors';

interface StoredAccount {
  _id: { toString(): string };
  userId: { toString(): string };
  provider: AuthProvider;
  providerAccountId: string;
  createdAt: Date;
}

function toLinkedAccountRecord(account: StoredAccount): LinkedAccountRecord {
  return {
    id: account._id.toString(),
    userId: account.userId.toString(),
    provider: account.provider,
    providerAccountId: account.providerAccountId,
    createdAt: account.createdAt,
  };
}

export class MongoAccountRepository implements IAccountRepository {
  async findByProvider(
    provider: AuthProvider,
    providerAccountId: string,
  ): Promise<LinkedAccountRecord | null> {
    if (!isAuthProvider(provider) || !isProviderAccountId(providerAccountId)) {
      return null;
    }
    return withDatabase('account.findByProvider', async () => {
      const account = await Account.findOne({ provider, providerAccountId }).lean();
      return account ? toLinkedAccountRecord(account) : null;
    });
  }

  async create(data: CreateLinkedAccountDTO): Promise<LinkedAccountRecord> {
    if (
      !isObjectIdString(data.userId) ||
      !isAuthProvider(data.provider) ||
      !isProviderAccountId(data.providerAccountId)
    ) {
      throw new RepositoryError();
    }
    return withDatabase('account.create', async () =>
      toLinkedAccountRecord(
        await Account.create({
          userId: data.userId,
          provider: data.provider,
          providerAccountId: data.providerAccountId,
        }),
      ),
    );
  }
}
