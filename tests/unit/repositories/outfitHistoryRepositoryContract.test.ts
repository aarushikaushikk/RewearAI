import { describeOutfitHistoryRepositoryContract } from '../../contracts/outfitHistoryRepositoryContract';
import { USER_IDS } from '../../contracts/fixtures';
import { MemoryOutfitHistoryRepository } from '../../mocks/memoryOutfitHistoryRepository';

describeOutfitHistoryRepositoryContract('in-memory', {
  newRepository: () => new MemoryOutfitHistoryRepository(),
  userIds: USER_IDS,
});
