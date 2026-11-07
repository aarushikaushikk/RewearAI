import { MemoryUserRepository } from '../../mocks/memoryUserRepository';
import { MemorySessionRepository } from '../../mocks/memorySessionRepository';
import { describeUserRepositoryContract } from '../../contracts/userRepositoryContract';
import { describeSessionRepositoryContract } from '../../contracts/sessionRepositoryContract';
import { describeAccountRepositoryContract } from '../../contracts/accountRepositoryContract';
import { MemoryAccountRepository } from '../../mocks/memoryAccountRepository';
import { USER_IDS } from '../../contracts/fixtures';

describeUserRepositoryContract('in-memory', {
  newRepository: () => new MemoryUserRepository(),
  unknownId: 'user_999999',
  addPasswordlessUser: (repo, email) => repo.addPasswordlessUserForTest(email),
});

describeAccountRepositoryContract('in-memory', {
  newRepository: () => new MemoryAccountRepository(),
  userIds: USER_IDS,
});

describeSessionRepositoryContract('in-memory', {
  newRepository: () => new MemorySessionRepository(),
  userIds: USER_IDS,
});
