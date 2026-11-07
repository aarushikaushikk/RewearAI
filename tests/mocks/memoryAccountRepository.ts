import {
  IAccountRepository,
  isAuthProvider,
  isProviderAccountId,
} from '@/lib/repositories/accountRepository';
import { DuplicateAccountError, RepositoryError } from '@/lib/repositories/repositoryErrors';
import { AuthProvider } from '@/types/account';
import { CreateLinkedAccountDTO, LinkedAccountRecord } from '@/types/linkedAccount';

export class MemoryAccountRepository implements IAccountRepository {
  private accounts: LinkedAccountRecord[] = [];
  private nextId = 1;

  async findByProvider(
    provider: AuthProvider,
    providerAccountId: string,
  ): Promise<LinkedAccountRecord | null> {
    const account = this.accounts.find(
      (a) => a.provider === provider && a.providerAccountId === providerAccountId,
    );
    return account && isProviderAccountId(providerAccountId) ? { ...account } : null;
  }

  async create(data: CreateLinkedAccountDTO): Promise<LinkedAccountRecord> {
    if (!isAuthProvider(data.provider) || !isProviderAccountId(data.providerAccountId)) {
      throw new RepositoryError();
    }
    // Checked and inserted with no await in between, like the database's unique indexes.
    const taken = this.accounts.some(
      (a) =>
        a.provider === data.provider &&
        (a.providerAccountId === data.providerAccountId || a.userId === data.userId),
    );
    if (taken) {
      throw new DuplicateAccountError();
    }

    const account: LinkedAccountRecord = {
      id: `account_${this.nextId++}`,
      userId: data.userId,
      provider: data.provider,
      providerAccountId: data.providerAccountId,
      createdAt: new Date(),
    };
    this.accounts.push(account);
    return { ...account };
  }
}
