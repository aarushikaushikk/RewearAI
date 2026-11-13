import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/db';
import { MongoOutfitHistoryRepository } from '@/lib/repositories/mongoOutfitHistoryRepository';
import { MongoWardrobeItemRepository } from '@/lib/repositories/mongoWardrobeItemRepository';
import { RepositoryError, RepositoryUnavailableError } from '@/lib/repositories/repositoryErrors';
import { Outfit } from '@/models/Outfit';
import { OutfitHistory } from '@/models/OutfitHistory';
import { combinationKey } from '@/services/outfitHistory/outfitCombination';
import { OutfitHistoryService } from '@/services/outfitHistoryService';
import type { Occasion } from '@/types/outfit';
import type { Category, WardrobeItemRecord } from '@/types/wardrobe';
import {
  describeOutfitHistoryRepositoryContract,
  ITEM_IDS,
  outfitFor,
} from '../contracts/outfitHistoryRepositoryContract';
import { USER_IDS } from '../contracts/fixtures';
import { errorFrom } from '../helpers/dbTestTools';
import {
  clearTestDatabase,
  disconnectTestClient,
  resetTestDatabase,
  startMongoTestServer,
  type MongoTestServer,
} from '../helpers/mongoTestServer';

const [ALEX, SAM] = USER_IDS;
const TODAY = '2026-11-11';
const { Collection, MongoNetworkError } = mongoose.mongo;

let server: MongoTestServer;

async function indexOn(collection: { indexes(): Promise<unknown[]> }, fields: string) {
  const indexes = (await collection.indexes()) as { key: Record<string, number>; unique?: boolean }[];
  return indexes.find((index) => Object.keys(index.key).join() === fields);
}

beforeAll(async () => {
  server = await startMongoTestServer();
  await connectToDatabase();
  // Mongoose's own build on connect must finish before tests drop the indexes.
  await Promise.allSettled([Outfit.init(), OutfitHistory.init()]);
});

afterAll(async () => {
  await server?.stop();
});

describeOutfitHistoryRepositoryContract('MongoDB', {
  newRepository: async () => {
    await clearTestDatabase(server);
    return new MongoOutfitHistoryRepository();
  },
  userIds: USER_IDS,
});

describe('MongoOutfitHistoryRepository on a real database', () => {
  const pair = [ITEM_IDS.top, ITEM_IDS.bottom];
  let repo: MongoOutfitHistoryRepository;

  beforeEach(async () => {
    await clearTestDatabase(server);
    repo = new MongoOutfitHistoryRepository();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds the history indexes before the first write, on a fresh database', async () => {
    await resetTestDatabase(server);
    await connectToDatabase();

    await repo.listByOwner(ALEX);

    expect(await indexOn(OutfitHistory.collection, 'owner,wornOn,combinationKey')).toMatchObject({
      key: { owner: 1, wornOn: 1, combinationKey: 1 },
      unique: true,
    });
    expect(await indexOn(OutfitHistory.collection, 'outfit,wornOn')).toMatchObject({
      key: { outfit: 1, wornOn: 1 },
      unique: true,
    });
    expect(await indexOn(OutfitHistory.collection, 'owner,wornOn')).toMatchObject({ key: { owner: 1, wornOn: -1 } });
    expect(await indexOn(Outfit.collection, 'owner')).toMatchObject({ key: { owner: 1 } });
  });

  it('lets the combination index alone refuse a second record that uses another outfit', async () => {
    await resetTestDatabase(server);
    await connectToDatabase();
    const work = await repo.findOrCreateOutfit(outfitFor(ALEX, pair));
    const dinner = await repo.findOrCreateOutfit(outfitFor(ALEX, pair, { occasion: 'dinner' }));
    const key = combinationKey(pair);

    const results = await Promise.all([
      repo.recordWorn({ ownerId: ALEX, outfitId: work.id, wornOn: TODAY, combinationKey: key }),
      repo.recordWorn({ ownerId: ALEX, outfitId: dinner.id, wornOn: TODAY, combinationKey: key }),
    ]);

    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(results[0].entry.id).toBe(results[1].entry.id);
    expect(await OutfitHistory.countDocuments({})).toBe(1);
  });

  it('stores references and the normalized key, and no copied clothing data', async () => {
    const outfit = await repo.findOrCreateOutfit(outfitFor(ALEX, pair));
    await repo.recordWorn({ ownerId: ALEX, outfitId: outfit.id, wornOn: TODAY, combinationKey: combinationKey(pair) });

    const storedOutfit = await Outfit.collection.findOne({});
    const storedEntry = await OutfitHistory.collection.findOne({});

    expect(storedOutfit).toMatchObject({ occasion: 'work', isSaved: false, explanation: 'Worn for Work: Top, Bottom.' });
    expect(storedOutfit?.owner.toString()).toBe(ALEX);
    expect(storedOutfit?.items.map(String)).toEqual(pair);
    expect(Object.keys(storedEntry ?? {}).sort()).toEqual(
      ['__v', '_id', 'combinationKey', 'createdAt', 'outfit', 'owner', 'updatedAt', 'wornOn'].sort(),
    );
    expect(storedEntry).toMatchObject({ wornOn: TODAY, combinationKey: combinationKey(pair) });
  });

  describe('compatibility with Saved Outfits (US9, PR #44)', () => {
    const { ObjectId } = mongoose.Types;
    const sorted = [ITEM_IDS.top, ITEM_IDS.bottom, ITEM_IDS.shoes];
    const generatedOrder = [ITEM_IDS.shoes, ITEM_IDS.top, ITEM_IDS.bottom];

    /** The filter US9 saves with: the owner, the occasion and the sorted IDs as an exact array. */
    function us9Filter(ownerId: string, occasion: Occasion, itemIds: string[]) {
      const items = itemIds.map((id) => id.toLowerCase()).sort().map((id) => new ObjectId(id));
      return { owner: new ObjectId(ownerId), occasion, items };
    }

    /** A record as US9's save upsert writes it: sorted items, saved, and no explanation. */
    async function insertUs9SavedOutfit(occasion: Occasion, itemIds: string[]) {
      const now = new Date('2026-11-10T12:00:00.000Z');
      const { insertedId } = await Outfit.collection.insertOne({
        ...us9Filter(ALEX, occasion, itemIds),
        isSaved: true,
        savedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return insertedId.toString();
    }

    it('stores a new outfit with sorted item references, so US9 finds it by exact array', async () => {
      const outfit = await repo.findOrCreateOutfit(outfitFor(ALEX, generatedOrder));

      const stored = await Outfit.collection.findOne({ _id: new ObjectId(outfit.id) });
      const foundByUs9 = await Outfit.findOne(us9Filter(ALEX, 'work', generatedOrder)).lean();

      expect(stored?.items.map(String)).toEqual(sorted);
      expect(foundByUs9?._id.toString()).toBe(outfit.id);
    });

    it('reuses an outfit US9 saved instead of adding another, and leaves it saved', async () => {
      const savedId = await insertUs9SavedOutfit('work', generatedOrder);

      const outfit = await repo.findOrCreateOutfit(outfitFor(ALEX, generatedOrder));

      expect(outfit).toEqual({ id: savedId, created: false });
      expect(await Outfit.countDocuments({})).toBe(1);
      expect(await Outfit.collection.findOne({})).toMatchObject({ isSaved: true });
    });

    it('still reuses an outfit stored with its items in another order', async () => {
      const now = new Date('2026-11-10T12:00:00.000Z');
      const { insertedId } = await Outfit.collection.insertOne({
        owner: new ObjectId(ALEX),
        occasion: 'work',
        items: generatedOrder.map((id) => new ObjectId(id)),
        explanation: 'Worn for Work: Shoes, Top, Bottom.',
        isSaved: false,
        createdAt: now,
        updatedAt: now,
      });

      const outfit = await repo.findOrCreateOutfit(outfitFor(ALEX, sorted));

      expect(outfit).toEqual({ id: insertedId.toString(), created: false });
      expect(await Outfit.countDocuments({})).toBe(1);
    });

    it("keeps a US9 outfit for another occasion, or another user's, separate", async () => {
      const dinnerId = await insertUs9SavedOutfit('dinner', generatedOrder);

      const work = await repo.findOrCreateOutfit(outfitFor(ALEX, generatedOrder));
      const sams = await repo.findOrCreateOutfit(outfitFor(SAM, generatedOrder, { occasion: 'dinner' }));

      expect(work.created && sams.created).toBe(true);
      expect(new Set([dinnerId, work.id, sams.id]).size).toBe(3);
    });
  });

  it('keeps history across repository instances and a reconnect', async () => {
    const outfit = await repo.findOrCreateOutfit(outfitFor(ALEX, pair));
    const { entry } = await repo.recordWorn({
      ownerId: ALEX,
      outfitId: outfit.id,
      wornOn: TODAY,
      combinationKey: combinationKey(pair),
    });

    await disconnectTestClient();
    await connectToDatabase();
    const listed = await new MongoOutfitHistoryRepository().listByOwner(ALEX);

    expect(listed).toEqual([entry]);
  });

  it('breaks ties within a date by the latest record, then the latest ID', async () => {
    const outfits = await Promise.all(
      [[ITEM_IDS.dress], pair].map((ids) => repo.findOrCreateOutfit(outfitFor(ALEX, ids))),
    );
    const { ObjectId } = mongoose.Types;
    const sameTime = new Date('2026-11-11T08:00:00.000Z');
    const firstId = new ObjectId();
    const secondId = new ObjectId();
    // Raw inserts, so both records really share one creation time.
    await OutfitHistory.collection.insertMany([
      {
        _id: firstId,
        owner: new ObjectId(ALEX),
        outfit: new ObjectId(outfits[0].id),
        wornOn: TODAY,
        combinationKey: ITEM_IDS.dress,
        createdAt: sameTime,
        updatedAt: sameTime,
      },
      {
        _id: secondId,
        owner: new ObjectId(ALEX),
        outfit: new ObjectId(outfits[1].id),
        wornOn: TODAY,
        combinationKey: combinationKey(pair),
        createdAt: sameTime,
        updatedAt: sameTime,
      },
    ]);

    const listed = await repo.listByOwner(ALEX);

    expect(listed.map((e) => e.id)).toEqual([secondId.toString(), firstId.toString()]);
  });

  it('returns no outfit details when the outfit belongs to someone else', async () => {
    const samsOutfit = await repo.findOrCreateOutfit(outfitFor(SAM, pair));
    await OutfitHistory.create({ owner: ALEX, outfit: samsOutfit.id, wornOn: TODAY, combinationKey: combinationKey(pair) });

    const [entry] = await repo.listByOwner(ALEX);

    expect(entry.outfit).toBeNull();
  });

  it('returns an empty list for a malformed owner ID without querying', async () => {
    expect(await repo.listByOwner('not-an-id')).toEqual([]);
  });

  it('refuses malformed IDs when writing', async () => {
    await expect(repo.findOrCreateOutfit(outfitFor('not-an-id', pair))).rejects.toBeInstanceOf(RepositoryError);
    await expect(repo.findOrCreateOutfit(outfitFor(ALEX, ['nope']))).rejects.toBeInstanceOf(RepositoryError);
    await expect(
      repo.recordWorn({ ownerId: ALEX, outfitId: 'nope', wornOn: TODAY, combinationKey: 'a' }),
    ).rejects.toBeInstanceOf(RepositoryError);
    expect(await OutfitHistory.countDocuments({})).toBe(0);
  });

  it('reports an outage as RepositoryUnavailableError', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const outfit = await repo.findOrCreateOutfit(outfitFor(ALEX, [ITEM_IDS.dress]));
    vi.spyOn(Collection.prototype, 'insertOne').mockRejectedValueOnce(new MongoNetworkError('down 10.0.0.5'));

    const error = await errorFrom(() =>
      repo.recordWorn({ ownerId: ALEX, outfitId: outfit.id, wornOn: TODAY, combinationKey: ITEM_IDS.dress }),
    );

    expect(error).toBeInstanceOf(RepositoryUnavailableError);
    expect(error.message).not.toContain('10.0.0.5');
    expect(await OutfitHistory.countDocuments({})).toBe(0);
  });

  it('reports a failed history read as a RepositoryError, not as an empty history', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(Collection.prototype, 'find').mockImplementationOnce(() => {
      throw new Error('cursor failed at 10.0.0.5');
    });

    const error = await errorFrom(() => repo.listByOwner(ALEX));

    expect(error).toBeInstanceOf(RepositoryError);
    expect(error.message).not.toContain('10.0.0.5');
  });
});

describe('OutfitHistoryService with real MongoDB repositories', () => {
  let items: MongoWardrobeItemRepository;
  let service: OutfitHistoryService;
  let saved = 0;

  function save(ownerId: string, category: Category): Promise<WardrobeItemRecord> {
    saved += 1;
    const publicId = `rewear/users/${ownerId}/${saved}`;
    return items.create({
      ownerId,
      image: { url: `https://res.cloudinary.com/test/image/upload/v1/${publicId}.jpg`, publicId },
      name: null,
      category,
      color: 'Black',
      style: 'Classic',
      season: 'All-season',
      formality: 'Casual',
    });
  }

  beforeEach(async () => {
    await resetTestDatabase(server);
    await connectToDatabase();
    items = new MongoWardrobeItemRepository();
    service = new OutfitHistoryService(new MongoOutfitHistoryRepository(), items);
  });

  it('keeps one history record when 10 simultaneous requests mark the same clothes', async () => {
    const top = await save(ALEX, 'Top');
    const bottom = await save(ALEX, 'Bottom');

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        service.markWorn(ALEX, {
          // Mixed order and occasion: still the same clothes on the same day.
          itemIds: i % 2 ? [top.id, bottom.id] : [bottom.id, top.id],
          occasion: i % 3 ? 'casual' : 'weekend',
          wornOn: TODAY,
        }),
      ),
    );

    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.entry.id)).size).toBe(1);
    expect(await OutfitHistory.countDocuments({})).toBe(1);
    const entry = await OutfitHistory.collection.findOne({});
    expect(await Outfit.exists({ _id: entry?.outfit, owner: ALEX })).not.toBeNull();
    // Losing requests may leave an unsaved outfit; each one is Alex's own, never saved.
    const outfits = await Outfit.collection.find({}).toArray();
    expect(outfits.every((o) => o.owner.toString() === ALEX && o.isSaved === false)).toBe(true);
  });

  it('lets two users record identical-looking outfits on the same day', async () => {
    const alexItems = [await save(ALEX, 'Top'), await save(ALEX, 'Bottom')];
    const samItems = [await save(SAM, 'Top'), await save(SAM, 'Bottom')];

    const [alex, sam] = await Promise.all([
      service.markWorn(ALEX, { itemIds: alexItems.map((i) => i.id), occasion: 'casual', wornOn: TODAY }),
      service.markWorn(SAM, { itemIds: samItems.map((i) => i.id), occasion: 'casual', wornOn: TODAY }),
    ]);

    expect(alex.created && sam.created).toBe(true);
    expect((await service.list(ALEX)).map((e) => e.id)).toEqual([alex.entry.id]);
    expect((await service.list(SAM)).map((e) => e.id)).toEqual([sam.entry.id]);
  });

  it('keeps an entry after a source item is deleted, with a placeholder and no failure', async () => {
    const top = await save(ALEX, 'Top');
    const bottom = await save(ALEX, 'Bottom');
    await service.markWorn(ALEX, { itemIds: [top.id, bottom.id], occasion: 'casual', wornOn: TODAY });

    await items.deleteForOwner(ALEX, bottom.id);
    const [entry] = await service.list(ALEX);

    expect(entry.items).toEqual([
      expect.objectContaining({ status: 'present', id: top.id }),
      { status: 'missing', id: bottom.id },
    ]);
  });

  it('marks a US9-saved outfit as worn twice with one outfit and one wear, items in outfit order', async () => {
    // Saved one after another, so their ObjectIds sort shoes, bottom, top.
    const shoes = await save(ALEX, 'Shoes');
    const bottom = await save(ALEX, 'Bottom');
    const top = await save(ALEX, 'Top');
    const sortedIds = [shoes.id, bottom.id, top.id];
    expect([...sortedIds].sort()).toEqual(sortedIds);
    const now = new Date('2026-11-10T12:00:00.000Z');
    const { insertedId } = await Outfit.collection.insertOne({
      owner: new mongoose.Types.ObjectId(ALEX),
      occasion: 'casual',
      items: sortedIds.map((id) => new mongoose.Types.ObjectId(id)),
      isSaved: true,
      savedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const request = { itemIds: [top.id, bottom.id, shoes.id], occasion: 'casual' as const, wornOn: TODAY };

    const first = await service.markWorn(ALEX, request);
    const second = await service.markWorn(ALEX, request);

    expect([first.created, second.created]).toEqual([true, false]);
    expect(second.entry.id).toBe(first.entry.id);
    expect(await Outfit.countDocuments({})).toBe(1);
    expect(await OutfitHistory.countDocuments({})).toBe(1);
    expect((await OutfitHistory.collection.findOne({}))?.outfit.toString()).toBe(insertedId.toString());
    const [entry] = await service.list(ALEX);
    expect(entry.items.map((i) => i.id)).toEqual([top.id, bottom.id, shoes.id]);
  });

  it("rejects another user's items and records nothing", async () => {
    const top = await save(ALEX, 'Top');
    const samsBottom = await save(SAM, 'Bottom');

    await expect(
      service.markWorn(ALEX, { itemIds: [top.id, samsBottom.id], occasion: 'casual', wornOn: TODAY }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(await Outfit.countDocuments({})).toBe(0);
    expect(await OutfitHistory.countDocuments({})).toBe(0);
  });
});
