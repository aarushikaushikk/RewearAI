import { describeOutfitFeedbackRepositoryContract } from '../../contracts/outfitFeedbackRepositoryContract';
import { USER_IDS } from '../../contracts/fixtures';
import { MemoryOutfitFeedbackRepository } from '../../mocks/memoryOutfitFeedbackRepository';
import { MemoryOutfitHistoryRepository } from '../../mocks/memoryOutfitHistoryRepository';

describeOutfitFeedbackRepositoryContract('in-memory', {
  newRepositories: () => {
    const outfits = new MemoryOutfitHistoryRepository();
    return { outfits, feedback: new MemoryOutfitFeedbackRepository(outfits) };
  },
  userIds: USER_IDS,
});
