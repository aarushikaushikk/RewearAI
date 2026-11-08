import { describe, it, expect, beforeEach } from 'vitest';
import { DuplicateImageError } from '@/lib/repositories/repositoryErrors';
import { IWardrobeItemRepository } from '@/lib/repositories/wardrobeItemRepository';
import { CreateWardrobeItemDTO } from '@/types/wardrobe';

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
  });
}
