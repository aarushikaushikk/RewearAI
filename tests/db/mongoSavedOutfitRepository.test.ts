import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectToDatabase } from '@/lib/db';
import { MongoSavedOutfitRepository } from '@/lib/repositories/mongoSavedOutfitRepository';
import { Outfit } from '@/models/Outfit';
import { USER_IDS } from '../contracts/fixtures';
import { describeSavedOutfitRepositoryContract, ITEM_IDS } from '../contracts/savedOutfitRepositoryContract';
import { clearTestDatabase, startMongoTestServer, type MongoTestServer } from '../helpers/mongoTestServer';

const [ALEX] = USER_IDS;

let server: MongoTestServer;

beforeAll(async () => {
  server = await startMongoTestServer();
  await connectToDatabase();
});

afterAll(async () => {
  await server?.stop();
});

describeSavedOutfitRepositoryContract('MongoDB', {
  newRepository: async () => {
    await clearTestDatabase(server);
    return new MongoSavedOutfitRepository();
  },
  userIds: USER_IDS,
});

describe('MongoSavedOutfitRepository on a real database', () => {
  let repo: MongoSavedOutfitRepository;

  beforeEach(async () => {
    await clearTestDatabase(server);
    repo = new MongoSavedOutfitRepository();
  });

  it('stores one Outfit document with item references, marked saved', async () => {
    const { outfit } = await repo.save(ALEX, 'work', [ITEM_IDS[1], ITEM_IDS[0]]);

    const stored = await Outfit.findById(outfit.id).lean();
    expect(stored?.owner.toString()).toBe(ALEX);
    expect(stored?.items.map(String).sort()).toEqual([ITEM_IDS[0], ITEM_IDS[1]]);
    expect(stored?.isSaved).toBe(true);
    expect(stored?.savedAt).toBeInstanceOf(Date);
    expect(stored?.explanation).toBeUndefined();
    await expect(Outfit.countDocuments()).resolves.toBe(1);
  });

  it('keeps the record, unsaved, when it is removed', async () => {
    const { outfit } = await repo.save(ALEX, 'work', [ITEM_IDS[0]]);

    await repo.unsaveForOwner(ALEX, outfit.id);

    const stored = await Outfit.findById(outfit.id).lean();
    expect(stored?.isSaved).toBe(false);
  });
});
