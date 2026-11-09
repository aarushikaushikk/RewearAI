import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/db';
import { MongoAvailableWardrobeItems } from '@/lib/outfits/mongoAvailableWardrobeItems';
import { MongoWardrobeItemRepository } from '@/lib/repositories/mongoWardrobeItemRepository';
import { RepositoryUnavailableError } from '@/lib/repositories/repositoryErrors';
import { WardrobeItem } from '@/models/WardrobeItem';
import { OutfitRecommendationService } from '@/services/outfitRecommendationService';
import type { Category } from '@/types/wardrobe';
import { USER_IDS } from '../contracts/fixtures';
import { itemFor } from '../contracts/wardrobeItemRepositoryContract';
import { errorFrom, recordQueries } from '../helpers/dbTestTools';
import { clearTestDatabase, startMongoTestServer, type MongoTestServer } from '../helpers/mongoTestServer';

const [ALEX, SAM] = USER_IDS;
const { Collection, MongoNetworkError } = mongoose.mongo;

let server: MongoTestServer;

beforeAll(async () => {
  server = await startMongoTestServer();
  await connectToDatabase();
});

afterAll(async () => {
  await server?.stop();
});

describe('MongoAvailableWardrobeItems', () => {
  const items = new MongoWardrobeItemRepository();
  let source: MongoAvailableWardrobeItems;

  // Items are saved through US2's repository; availability is set on the model directly, since
  // the US6 update method isn't on this branch.
  async function save(ownerId: string, publicId: string, category: Category = 'Top') {
    return items.create({ ...itemFor(ownerId, publicId), category });
  }

  async function markUnavailable(id: string) {
    await WardrobeItem.updateOne({ _id: id }, { $set: { isAvailable: false } });
  }

  beforeEach(async () => {
    await clearTestDatabase(server);
    source = new MongoAvailableWardrobeItems();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns only the owner's available items, newest first, as plain records", async () => {
    const first = await save(ALEX, 'u/a/1');
    const hidden = await save(ALEX, 'u/a/2');
    await save(SAM, 'u/b/1');
    const last = await save(ALEX, 'u/a/3');
    await markUnavailable(hidden.id);

    const result = await source.listAvailableByOwner(ALEX);

    expect(result.map((item) => item.id)).toEqual([last.id, first.id]);
    expect(result[0]).toMatchObject({ ownerId: ALEX, isAvailable: true, category: 'Top' });
    expect(result[0].createdAt).toBeInstanceOf(Date);
    expect(Object.keys(result[0])).not.toContain('_id');
  });

  it('sends one query, filtered by owner and availability', async () => {
    await save(ALEX, 'u/a/1');

    const queries = await recordQueries(() => source.listAvailableByOwner(ALEX));

    expect(queries).toHaveLength(1);
    expect(queries[0].method).toBe('find');
    const filter = queries[0].args[0] as { owner: unknown; isAvailable: unknown };
    expect(String(filter.owner)).toBe(ALEX);
    expect(filter.isAvailable).toBe(true);
  });

  it("never returns another user's items", async () => {
    await save(SAM, 'u/b/1');

    await expect(source.listAvailableByOwner(ALEX)).resolves.toEqual([]);
  });

  it('returns nothing, without a query, for an owner that is not a stored ID', async () => {
    await save(ALEX, 'u/a/1');

    const queries = await recordQueries(async () => {
      await expect(source.listAvailableByOwner('not-an-id')).resolves.toEqual([]);
    });

    expect(queries).toHaveLength(0);
  });

  it('reports a network failure as unavailable, with nothing from the driver in logs or the error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Collection.prototype, 'find').mockImplementation(() => {
      throw new MongoNetworkError('connect ECONNREFUSED 127.0.0.1:27017 rewear-user:s3cr3t');
    });

    const error = await errorFrom(() => source.listAvailableByOwner(ALEX));

    expect(error).toBeInstanceOf(RepositoryUnavailableError);
    expect(JSON.stringify([String(error), consoleError.mock.calls])).not.toMatch(/s3cr3t|127\.0\.0\.1|ECONNREFUSED/);
  });

  it('feeds the recommendation service only available items from the real database', async () => {
    const top = await save(ALEX, 'u/a/top', 'Top');
    const bottom = await save(ALEX, 'u/a/bottom', 'Bottom');
    const dress = await save(ALEX, 'u/a/dress', 'Dress');
    await save(SAM, 'u/b/shoes', 'Shoes');
    await markUnavailable(dress.id);

    const result = await new OutfitRecommendationService(source).generate(ALEX, 'dinner');

    // itemFor saves Smart casual items, which suit dinner. The newer dress is unavailable.
    expect(result).toMatchObject({ status: 'ok', occasion: 'dinner' });
    if (result.status !== 'ok') throw new Error('expected an outfit');
    expect(result.items.map((i) => i.id)).toEqual([top.id, bottom.id]);
  });
});
