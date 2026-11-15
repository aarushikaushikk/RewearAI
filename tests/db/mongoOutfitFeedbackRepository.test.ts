import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase } from '@/lib/db';
import { MongoOutfitFeedbackRepository } from '@/lib/repositories/mongoOutfitFeedbackRepository';
import { MongoOutfitHistoryRepository } from '@/lib/repositories/mongoOutfitHistoryRepository';
import { MongoSavedOutfitRepository } from '@/lib/repositories/mongoSavedOutfitRepository';
import { Feedback } from '@/models/Feedback';
import { Outfit } from '@/models/Outfit';
import { USER_IDS } from '../contracts/fixtures';
import {
  describeOutfitFeedbackRepositoryContract,
  FEEDBACK_ITEM_IDS,
} from '../contracts/outfitFeedbackRepositoryContract';
import { clearTestDatabase, startMongoTestServer, type MongoTestServer } from '../helpers/mongoTestServer';

const [ALEX] = USER_IDS;
const [SHIRT, TROUSERS] = FEEDBACK_ITEM_IDS;

let server: MongoTestServer;

beforeAll(async () => {
  server = await startMongoTestServer();
  await connectToDatabase();
});

afterAll(async () => {
  await server?.stop();
});

describeOutfitFeedbackRepositoryContract('MongoDB', {
  newRepositories: async () => {
    await clearTestDatabase(server);
    return { outfits: new MongoOutfitHistoryRepository(), feedback: new MongoOutfitFeedbackRepository() };
  },
  userIds: USER_IDS,
});

describe('MongoOutfitFeedbackRepository on a real database', () => {
  const outfits = new MongoOutfitHistoryRepository();
  let repo: MongoOutfitFeedbackRepository;

  beforeEach(async () => {
    await clearTestDatabase(server);
    repo = new MongoOutfitFeedbackRepository();
  });

  async function outfitId() {
    return (await outfits.findOrCreateOutfit({ ownerId: ALEX, occasion: 'work', itemIds: [SHIRT, TROUSERS] })).id;
  }

  it('stores one Feedback document and links it from the outfit', async () => {
    const id = await outfitId();

    await repo.setRating(ALEX, id, 'positive');
    await repo.setRating(ALEX, id, 'negative');

    const stored = await Feedback.find().lean();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ rating: 'negative' });
    expect(stored[0].owner.toString()).toBe(ALEX);
    expect(stored[0].outfit.toString()).toBe(id);
    const outfit = await Outfit.findById(id).lean();
    expect(outfit?.feedback?.toString()).toBe(stored[0]._id.toString());
  });

  it('deletes the Feedback document and unlinks it when cleared, keeping the outfit', async () => {
    const id = await outfitId();
    await repo.setRating(ALEX, id, 'negative');

    await repo.clearRating(ALEX, id);

    await expect(Feedback.countDocuments()).resolves.toBe(0);
    const outfit = await Outfit.findById(id).lean();
    expect(outfit).not.toBeNull();
    expect(outfit?.feedback).toBeUndefined();
  });

  it('builds the unique index on the rated outfit before writing', async () => {
    await repo.listRatedByOccasion(ALEX, 'work');

    const indexes = (await Feedback.collection.indexes()) as { key: Record<string, number>; unique?: boolean }[];
    expect(indexes.find((index) => Object.keys(index.key).join() === 'outfit')).toMatchObject({ unique: true });
  });

  it('rates the same outfit record that Saved Outfits (US9) uses', async () => {
    const { outfit } = await new MongoSavedOutfitRepository().save(ALEX, 'work', [TROUSERS, SHIRT]);
    const id = await outfitId();

    expect(id).toBe(outfit.id);
    await repo.setRating(ALEX, id, 'positive');
    await expect(Outfit.countDocuments()).resolves.toBe(1);
  });
});
