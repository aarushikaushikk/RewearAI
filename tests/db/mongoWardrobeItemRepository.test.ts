import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectToDatabase } from '@/lib/db';
import { WardrobeItem } from '@/models/WardrobeItem';
import { MongoWardrobeItemRepository } from '@/lib/repositories/mongoWardrobeItemRepository';
import { DuplicateImageError, RepositoryError } from '@/lib/repositories/repositoryErrors';
import { WardrobeItemService } from '@/services/wardrobeItemService';
import {
  describeWardrobeItemRepositoryContract,
  itemFor,
} from '../contracts/wardrobeItemRepositoryContract';
import { USER_IDS } from '../contracts/fixtures';
import { MemoryImageStore } from '../mocks/memoryImageStore';
import { JPEG_BYTES } from '../helpers/imageBytes';
import { errorFrom } from '../helpers/dbTestTools';
import {
  clearTestDatabase,
  resetTestDatabase,
  startMongoTestServer,
  type MongoTestServer,
} from '../helpers/mongoTestServer';

const [ALEX, SAM] = USER_IDS;

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

  it('lets a retried save through the service return the one stored item', async () => {
    const service = new WardrobeItemService(repo, new MemoryImageStore());
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
