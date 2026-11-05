import { MemoryUserRepository } from '../../mocks/memoryUserRepository';
import { MemorySessionRepository } from '../../mocks/memorySessionRepository';
import { describeUserRepositoryContract } from '../../contracts/userRepositoryContract';
import { describeSessionRepositoryContract } from '../../contracts/sessionRepositoryContract';

describeUserRepositoryContract('in-memory', {
  newRepository: () => new MemoryUserRepository(),
  unknownId: 'user_999999',
});

describeSessionRepositoryContract('in-memory', {
  newRepository: () => new MemorySessionRepository(),
  userIds: ['user_a', 'user_b'],
});
