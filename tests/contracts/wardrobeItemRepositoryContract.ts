import { describe, it, expect, beforeEach } from 'vitest';
import { DuplicateImageError } from '@/lib/repositories/repositoryErrors';
import { IWardrobeItemRepository } from '@/lib/repositories/wardrobeItemRepository';
import { CreateWardrobeItemDTO, WardrobeItemDetails } from '@/types/wardrobe';

export interface WardrobeItemContractSetup {
  /** Returns an empty repository. */
  newRepository(): Promise<IWardrobeItemRepository> | IWardrobeItemRepository;
  /** Valid user IDs in this repository's format. */
  userIds: [string, string];
}

export function itemFor(ownerId: string, publicId: string): CreateWardrobeItemDTO {
  return {
    ownerId,
    image: { url: `https://res.cloudinary.com/test/image/upload/v1/${publicId}.jpg`, publicId },
    name: 'Linen shirt',
    category: 'Top',
    color: 'White',
    style: 'Button-down',
    season: 'Summer',
    formality: 'Smart casual',
  };
}

/** Edited details for an item, as the Clothing Detail page saves them (US4). */
export const EDITED_DETAILS: WardrobeItemDetails = {
  name: 'White Oxford Shirt',
  category: 'Top',
  color: 'Blue',
  style: 'Oxford',
  season: 'All-season',
  formality: 'Formal',
};

/**
 * Behaviour every IWardrobeItemRepository must have. The MongoDB adapter runs this
 * same suite, so it must not depend on how a repository stores its records.
 */
export function describeWardrobeItemRepositoryContract(
  name: string,
  setup: WardrobeItemContractSetup,
): void {
  describe(`IWardrobeItemRepository contract: ${name}`, () => {
    const [userA, userB] = setup.userIds;
    let repo: IWardrobeItemRepository;

    beforeEach(async () => {
      repo = await setup.newRepository();
    });

    describe('create', () => {
      it('returns the stored item, available, with a string ID and Dates', async () => {
        const item = await repo.create(itemFor(userA, 'u/a/1'));

        expect(typeof item.id).toBe('string');
        expect(item.id.length).toBeGreaterThan(0);
        expect(item).toMatchObject({
          ownerId: userA,
          image: itemFor(userA, 'u/a/1').image,
          name: 'Linen shirt',
          category: 'Top',
          color: 'White',
          style: 'Button-down',
          season: 'Summer',
          formality: 'Smart casual',
          isAvailable: true,
        });
        expect(item.createdAt).toBeInstanceOf(Date);
        expect(item.updatedAt).toBeInstanceOf(Date);
      });

      it('stores a missing name as null', async () => {
        const item = await repo.create({ ...itemFor(userA, 'u/a/1'), name: null });

        expect(item.name).toBeNull();
      });

      it('throws DuplicateImageError for an image already used, whoever owns it', async () => {
        await repo.create(itemFor(userA, 'u/a/1'));

        await expect(repo.create(itemFor(userA, 'u/a/1'))).rejects.toBeInstanceOf(
          DuplicateImageError,
        );
        await expect(repo.create(itemFor(userB, 'u/a/1'))).rejects.toBeInstanceOf(
          DuplicateImageError,
        );
      });
    });

    describe('findByImage', () => {
      it("finds the owner's item for an image", async () => {
        const created = await repo.create(itemFor(userA, 'u/a/1'));

        const found = await repo.findByImage(userA, 'u/a/1');

        expect(found?.id).toBe(created.id);
      });

      it("never returns another user's item", async () => {
        await repo.create(itemFor(userA, 'u/a/1'));

        await expect(repo.findByImage(userB, 'u/a/1')).resolves.toBeNull();
      });

      it('returns null for an unknown image', async () => {
        await expect(repo.findByImage(userA, 'u/a/missing')).resolves.toBeNull();
      });
    });

    describe('findUsedImageIds', () => {
      it('returns only the IDs that an item uses', async () => {
        await repo.create(itemFor(userA, 'u/a/1'));
        await repo.create(itemFor(userB, 'u/b/1'));

        const used = await repo.findUsedImageIds(['u/a/1', 'u/a/unused', 'u/b/1']);

        expect([...used].sort()).toEqual(['u/a/1', 'u/b/1']);
      });

      it('returns nothing for an empty list', async () => {
        await expect(repo.findUsedImageIds([])).resolves.toEqual([]);
      });
    });

    describe('listByOwner', () => {
      it("returns only the owner's items, newest first", async () => {
        const first = await repo.create(itemFor(userA, 'u/a/1'));
        await repo.create(itemFor(userB, 'u/b/1'));
        const second = await repo.create(itemFor(userA, 'u/a/2'));

        const items = await repo.listByOwner(userA);

        expect(items.map((item) => item.id)).toEqual([second.id, first.id]);
        expect(items.every((item) => item.ownerId === userA)).toBe(true);
      });

      it('returns an empty list for a user with no items or an ID that is not stored', async () => {
        await repo.create(itemFor(userA, 'u/a/1'));

        await expect(repo.listByOwner(userB)).resolves.toEqual([]);
        await expect(repo.listByOwner('not-an-id')).resolves.toEqual([]);
      });
    });

    describe('setAvailability', () => {
      it('marks an item unavailable, then available again, and keeps each change', async () => {
        const item = await repo.create(itemFor(userA, 'u/a/1'));

        const unavailable = await repo.setAvailability(userA, item.id, false);
        expect(unavailable).toMatchObject({ id: item.id, ownerId: userA, isAvailable: false });
        expect((await repo.listByOwner(userA))[0].isAvailable).toBe(false);

        const available = await repo.setAvailability(userA, item.id, true);
        expect(available).toMatchObject({ id: item.id, isAvailable: true });
        expect((await repo.listByOwner(userA))[0].isAvailable).toBe(true);
      });

      it('gives the same result when an update is repeated', async () => {
        const item = await repo.create(itemFor(userA, 'u/a/1'));

        await repo.setAvailability(userA, item.id, false);
        const repeated = await repo.setAvailability(userA, item.id, false);

        expect(repeated?.isAvailable).toBe(false);
        expect(await repo.listByOwner(userA)).toHaveLength(1);
      });

      it("returns null and changes nothing for another user's item", async () => {
        const item = await repo.create(itemFor(userA, 'u/a/1'));

        await expect(repo.setAvailability(userB, item.id, false)).resolves.toBeNull();
        expect((await repo.listByOwner(userA))[0].isAvailable).toBe(true);
      });

      it('returns null for an unknown or malformed item ID, or a malformed owner', async () => {
        const item = await repo.create(itemFor(userA, 'u/a/1'));

        await expect(repo.setAvailability(userA, '64b0000000000000000000ff', false)).resolves.toBeNull();
        await expect(repo.setAvailability(userA, 'not-an-id', false)).resolves.toBeNull();
        await expect(repo.setAvailability('not-an-id', item.id, false)).resolves.toBeNull();
        expect((await repo.listByOwner(userA))[0].isAvailable).toBe(true);
      });
    });

    describe('listAvailableByOwner', () => {
      it('leaves out an unavailable item, and includes it again once it is available', async () => {
        const shirt = await repo.create(itemFor(userA, 'u/a/1'));
        const coat = await repo.create(itemFor(userA, 'u/a/2'));

        await repo.setAvailability(userA, shirt.id, false);
        expect((await repo.listAvailableByOwner(userA)).map((item) => item.id)).toEqual([coat.id]);

        await repo.setAvailability(userA, shirt.id, true);
        expect((await repo.listAvailableByOwner(userA)).map((item) => item.id)).toEqual([
          coat.id,
          shirt.id,
        ]);
      });

      it("never includes another user's items", async () => {
        await repo.create(itemFor(userB, 'u/b/1'));

        await expect(repo.listAvailableByOwner(userA)).resolves.toEqual([]);
        await expect(repo.listAvailableByOwner('not-an-id')).resolves.toEqual([]);
      });
    });

    describe('findByIdForOwner', () => {
      it("finds the owner's item by ID", async () => {
        const created = await repo.create(itemFor(userA, 'u/a/1'));

        const found = await repo.findByIdForOwner(userA, created.id);

        expect(found).toMatchObject({ id: created.id, ownerId: userA, name: 'Linen shirt' });
      });

      it("never returns another user's item", async () => {
        const created = await repo.create(itemFor(userA, 'u/a/1'));

        await expect(repo.findByIdForOwner(userB, created.id)).resolves.toBeNull();
      });

      it('returns null for an unknown or malformed ID', async () => {
        await repo.create(itemFor(userA, 'u/a/1'));

        await expect(repo.findByIdForOwner(userA, '64b0000000000000000000ff')).resolves.toBeNull();
        await expect(repo.findByIdForOwner(userA, 'not-an-id')).resolves.toBeNull();
      });
    });

    describe('updateForOwner', () => {
      it('replaces the details, keeps the image and availability, and returns the update', async () => {
        const created = await repo.create(itemFor(userA, 'u/a/1'));
        await new Promise((resolve) => setTimeout(resolve, 5));

        const updated = await repo.updateForOwner(userA, created.id, EDITED_DETAILS);

        expect(updated).toMatchObject({
          ...EDITED_DETAILS,
          id: created.id,
          ownerId: userA,
          image: created.image,
          isAvailable: true,
        });
        expect(updated!.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
        expect(updated!.createdAt.getTime()).toBe(created.createdAt.getTime());
      });

      it('persists the update for later reads', async () => {
        const created = await repo.create(itemFor(userA, 'u/a/1'));
        await repo.updateForOwner(userA, created.id, EDITED_DETAILS);

        await expect(repo.findByIdForOwner(userA, created.id)).resolves.toMatchObject(
          EDITED_DETAILS,
        );
      });

      it('clears the name when it is null', async () => {
        const created = await repo.create(itemFor(userA, 'u/a/1'));

        const updated = await repo.updateForOwner(userA, created.id, { ...EDITED_DETAILS, name: null });

        expect(updated?.name).toBeNull();
        expect((await repo.findByIdForOwner(userA, created.id))?.name).toBeNull();
      });

      it("returns null and changes nothing for another user's item", async () => {
        const created = await repo.create(itemFor(userA, 'u/a/1'));

        await expect(repo.updateForOwner(userB, created.id, EDITED_DETAILS)).resolves.toBeNull();
        await expect(repo.findByIdForOwner(userA, created.id)).resolves.toMatchObject({
          name: 'Linen shirt',
          color: 'White',
        });
      });

      it('returns null for an unknown or malformed ID', async () => {
        await expect(
          repo.updateForOwner(userA, '64b0000000000000000000ff', EDITED_DETAILS),
        ).resolves.toBeNull();
        await expect(repo.updateForOwner(userA, 'not-an-id', EDITED_DETAILS)).resolves.toBeNull();
      });
    });

    describe('deleteForOwner', () => {
      it("deletes the owner's item and reports it", async () => {
        const created = await repo.create(itemFor(userA, 'u/a/1'));

        await expect(repo.deleteForOwner(userA, created.id)).resolves.toBe(true);
        await expect(repo.findByIdForOwner(userA, created.id)).resolves.toBeNull();
        await expect(repo.listByOwner(userA)).resolves.toEqual([]);
      });

      it('frees the image ID once its item is gone', async () => {
        const created = await repo.create(itemFor(userA, 'u/a/1'));
        await repo.deleteForOwner(userA, created.id);

        await expect(repo.findUsedImageIds(['u/a/1'])).resolves.toEqual([]);
      });

      it("returns false and keeps another user's item", async () => {
        const created = await repo.create(itemFor(userA, 'u/a/1'));

        await expect(repo.deleteForOwner(userB, created.id)).resolves.toBe(false);
        await expect(repo.findByIdForOwner(userA, created.id)).resolves.not.toBeNull();
      });

      it('returns false for an item already deleted, or a malformed ID', async () => {
        const created = await repo.create(itemFor(userA, 'u/a/1'));
        await repo.deleteForOwner(userA, created.id);

        await expect(repo.deleteForOwner(userA, created.id)).resolves.toBe(false);
        await expect(repo.deleteForOwner(userA, 'not-an-id')).resolves.toBe(false);
      });
    });
  });
}
