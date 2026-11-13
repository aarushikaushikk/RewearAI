import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectToDatabase } from '@/lib/db';
import { WardrobeItem } from '@/models/WardrobeItem';
import { MongoWardrobeItemRepository } from '@/lib/repositories/mongoWardrobeItemRepository';
import {
  DuplicateImageError,
  RepositoryError,
  RepositoryUnavailableError,
} from '@/lib/repositories/repositoryErrors';
import { WardrobeItemService } from '@/services/wardrobeItemService';
import {
  describeWardrobeItemRepositoryContract,
  EDITED_DETAILS,
  itemFor,
} from '../contracts/wardrobeItemRepositoryContract';
import { USER_IDS } from '../contracts/fixtures';
import { MemoryImageStore } from '../mocks/memoryImageStore';
import { JPEG_BYTES } from '../helpers/imageBytes';
import { errorFrom } from '../helpers/dbTestTools';
import {
  clearTestDatabase,
  disconnectTestClient,
  resetTestDatabase,
  startMongoTestServer,
  type MongoTestServer,
} from '../helpers/mongoTestServer';

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

describeWardrobeItemRepositoryContract('MongoDB', {
  newRepository: async () => {
    await clearTestDatabase(server);
    return new MongoWardrobeItemRepository();
  },
  userIds: USER_IDS,
});

describe('MongoWardrobeItemRepository on a real database', () => {
  let repo: MongoWardrobeItemRepository;

  beforeEach(async () => {
    await clearTestDatabase(server);
    repo = new MongoWardrobeItemRepository();
  });

  it('stores the owner as a reference, and returns it as the same string ID', async () => {
    const created = await repo.create(itemFor(ALEX, 'u/a/1'));
    const stored = await WardrobeItem.collection.findOne({ 'image.publicId': 'u/a/1' });

    expect(stored?.owner.toString()).toBe(ALEX);
    expect(created.id).toBe(stored?._id.toString());
    expect(Object.keys(created)).not.toContain('_id');
  });

  it('builds the unique image index before the first write, on a fresh database', async () => {
    await resetTestDatabase(server);
    await connectToDatabase();

    await repo.create(itemFor(ALEX, 'u/a/1'));
    const error = await errorFrom(() => repo.create(itemFor(SAM, 'u/a/1')));

    expect(error).toBeInstanceOf(DuplicateImageError);
    expect(await WardrobeItem.countDocuments({ 'image.publicId': 'u/a/1' })).toBe(1);
  });

  it('keeps one item when concurrent saves race for the same image', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => repo.create(itemFor(ALEX, 'u/a/race'))),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await WardrobeItem.countDocuments({ 'image.publicId': 'u/a/race' })).toBe(1);
  });

  it('does not log an expected duplicate as a failure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await repo.create(itemFor(ALEX, 'u/a/1'));

    await errorFrom(() => repo.create(itemFor(ALEX, 'u/a/1')));

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('refuses an owner that is not a stored ID, without a query', async () => {
    const error = await errorFrom(() => repo.create(itemFor('user_1', 'u/a/1')));

    expect(error).toBeInstanceOf(RepositoryError);
    expect(await WardrobeItem.countDocuments()).toBe(0);
  });

  it('returns null rather than querying for an owner that is not a stored ID', async () => {
    await expect(repo.findByImage('not-an-id', 'u/a/1')).resolves.toBeNull();
  });

  describe('availability (US6)', () => {
    const DRIVER_DETAIL = 'connect ECONNREFUSED 127.0.0.1:27017 rewear-user:s3cr3t';

    // Restores spies even when an assertion fails, so an injected failure can't leak.
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('stores the change in the database, scoped to the owner', async () => {
      const item = await repo.create(itemFor(ALEX, 'u/a/1'));

      await repo.setAvailability(ALEX, item.id, false);

      const stored = await WardrobeItem.collection.findOne({ 'image.publicId': 'u/a/1' });
      expect(stored?.isAvailable).toBe(false);
      expect(stored?.owner.toString()).toBe(ALEX);
    });

    it('keeps an availability change after reconnecting, and leaves the item out of available items', async () => {
      const shirt = await repo.create(itemFor(ALEX, 'u/a/1'));
      const coat = await repo.create(itemFor(ALEX, 'u/a/2'));
      await repo.setAvailability(ALEX, shirt.id, false);

      await disconnectTestClient();

      const reconnected = new MongoWardrobeItemRepository();
      expect(await reconnected.findByIdForOwner(ALEX, shirt.id)).toMatchObject({ isAvailable: false });
      expect((await reconnected.listAvailableByOwner(ALEX)).map((item) => item.id)).toEqual([coat.id]);
      expect(await reconnected.listByOwner(ALEX)).toHaveLength(2);
    });

    it('answers a malformed owner or item ID without querying', async () => {
      const find = vi.spyOn(WardrobeItem, 'find');
      const update = vi.spyOn(WardrobeItem, 'findOneAndUpdate');

      await expect(repo.listByOwner('not-an-id')).resolves.toEqual([]);
      await expect(repo.listAvailableByOwner('not-an-id')).resolves.toEqual([]);
      await expect(repo.setAvailability(ALEX, 'not-an-id', false)).resolves.toBeNull();

      expect(find).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it.each([
      ['setAvailability', 'findOneAndUpdate', (r: MongoWardrobeItemRepository) => r.setAvailability(ALEX, SAM, false)],
      ['listByOwner', 'find', (r: MongoWardrobeItemRepository) => r.listByOwner(ALEX)],
      ['listAvailableByOwner', 'find', (r: MongoWardrobeItemRepository) => r.listAvailableByOwner(ALEX)],
    ] as const)(
      '%s reports a network failure as unavailable, logging nothing from the driver',
      async (_name, driverMethod, run) => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(Collection.prototype, driverMethod).mockImplementation(() => {
          throw new MongoNetworkError(DRIVER_DETAIL);
        });

        const error = await errorFrom(() => run(repo));

        expect(error).toBeInstanceOf(RepositoryUnavailableError);
        expect(JSON.stringify([String(error), consoleError.mock.calls])).not.toMatch(
          /s3cr3t|127\.0\.0\.1|ECONNREFUSED/,
        );
      },
    );
  });

  // US4 (#9)
  it('applies the model rules to an update, and leaves the item unchanged when they fail', async () => {
    const created = await repo.create(itemFor(ALEX, 'u/a/1'));

    const error = await errorFrom(() =>
      repo.updateForOwner(ALEX, created.id, { ...EDITED_DETAILS, category: 'Hat' as never }),
    );

    expect(error).toBeInstanceOf(RepositoryError);
    expect(await repo.findByIdForOwner(ALEX, created.id)).toMatchObject({ category: 'Top' });
  });

  it('removes the stored name field when an update clears it', async () => {
    const created = await repo.create(itemFor(ALEX, 'u/a/1'));

    await repo.updateForOwner(ALEX, created.id, { ...EDITED_DETAILS, name: null });
    const stored = await WardrobeItem.collection.findOne({ 'image.publicId': 'u/a/1' });

    expect(stored).not.toHaveProperty('name');
  });

  it('keeps an update and a deletion after reconnecting', async () => {
    const kept = await repo.create(itemFor(ALEX, 'u/a/1'));
    const removed = await repo.create(itemFor(ALEX, 'u/a/2'));
    await repo.updateForOwner(ALEX, kept.id, EDITED_DETAILS);
    await repo.deleteForOwner(ALEX, removed.id);

    await disconnectTestClient();

    const items = await new MongoWardrobeItemRepository().listByOwner(ALEX);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: kept.id, ...EDITED_DETAILS });
  });

  it('lets a retried save through the service return the one stored item', async () => {
    const service = new WardrobeItemService(repo, new MemoryImageStore(), 'test-db');
    const image = await service.uploadImage(ALEX, JPEG_BYTES);
    const details = {
      publicId: image.publicId,
      name: '',
      category: 'Top',
      color: 'White',
      style: 'Button-down',
      season: 'Summer',
      formality: 'Smart casual',
    };

    const [first, second] = await Promise.all([
      service.createItem(ALEX, details),
      service.createItem(ALEX, details),
    ]);

    expect(first.item.id).toBe(second.item.id);
    expect([first.created, second.created].sort()).toEqual([false, true]);
    expect(await WardrobeItem.countDocuments()).toBe(1);
  });
});
