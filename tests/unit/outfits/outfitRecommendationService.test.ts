import { describe, expect, it, vi } from 'vitest';
import { RepositoryUnavailableError } from '@/lib/repositories/repositoryErrors';
import { OutfitRecommendationService } from '@/services/outfitRecommendationService';
import { OCCASIONS, type Occasion } from '@/types/outfit';
import type { Formality } from '@/types/wardrobe';
import { MemoryAvailableWardrobeItems, wardrobeRecord } from '../../mocks/memoryAvailableWardrobeItems';

const ALEX = 'user_alex';
const SAM = 'user_sam';

const FORMALITY_FOR: Record<Occasion, Formality> = {
  work: 'Smart casual',
  dinner: 'Formal',
  weekend: 'Casual',
  casual: 'Casual',
  formal: 'Formal',
};

describe('OutfitRecommendationService', () => {
  it.each(OCCASIONS)('generates a %s outfit from the user\'s available items', async (occasion) => {
    const formality = FORMALITY_FOR[occasion];
    const top = wardrobeRecord(ALEX, 'Top', { formality, name: 'Oxford shirt' });
    const bottom = wardrobeRecord(ALEX, 'Bottom', { formality });
    const service = new OutfitRecommendationService(new MemoryAvailableWardrobeItems([top, bottom]));

    const result = await service.generate(ALEX, occasion);

    expect(result).toEqual({
      status: 'ok',
      occasion,
      season: 'All-season',
      items: [
        {
          role: 'top',
          id: top.id,
          name: 'Oxford shirt',
          image: { url: top.image.url },
          category: 'Top',
          color: 'Black',
          style: 'Top',
          season: 'All-season',
          formality,
        },
        {
          role: 'bottom',
          id: bottom.id,
          name: null,
          image: { url: bottom.image.url },
          category: 'Bottom',
          color: 'Black',
          style: 'Bottom',
          season: 'All-season',
          formality,
        },
      ],
    });
  });

  it('exposes only display fields: no owner, image public ID, availability, or timestamps', async () => {
    const service = new OutfitRecommendationService(
      new MemoryAvailableWardrobeItems([wardrobeRecord(ALEX, 'Dress')]),
    );

    const result = await service.generate(ALEX, 'casual');

    expect(result.status).toBe('ok');
    const json = JSON.stringify(result);
    expect(json).not.toMatch(/ownerId|publicId|isAvailable|createdAt|updatedAt|rewear\/users/);
  });

  it('asks the source only for the given user\'s items', async () => {
    const source = new MemoryAvailableWardrobeItems([wardrobeRecord(ALEX, 'Dress')]);
    const list = vi.spyOn(source, 'listAvailableByOwner');

    await new OutfitRecommendationService(source).generate(ALEX, 'casual');

    expect(list).toHaveBeenCalledExactlyOnceWith(ALEX);
  });

  it('never uses another user\'s items, so their wardrobe cannot complete an outfit', async () => {
    const service = new OutfitRecommendationService(
      new MemoryAvailableWardrobeItems([wardrobeRecord(ALEX, 'Top'), wardrobeRecord(SAM, 'Bottom')]),
    );

    await expect(service.generate(ALEX, 'casual')).resolves.toEqual({
      status: 'insufficient',
      occasion: 'casual',
      reason: 'no_complete_outfit',
    });
  });

  it('still excludes another user\'s or unavailable items if a source wrongly returns them', async () => {
    const leaky = {
      listAvailableByOwner: async () => [
        wardrobeRecord(SAM, 'Dress'),
        wardrobeRecord(ALEX, 'Dress', { isAvailable: false }),
      ],
    };

    await expect(new OutfitRecommendationService(leaky).generate(ALEX, 'casual')).resolves.toEqual({
      status: 'insufficient',
      occasion: 'casual',
      reason: 'no_suitable_items',
    });
  });

  it('reports insufficient items for an empty wardrobe', async () => {
    const service = new OutfitRecommendationService(new MemoryAvailableWardrobeItems());

    await expect(service.generate(ALEX, 'formal')).resolves.toEqual({
      status: 'insufficient',
      occasion: 'formal',
      reason: 'no_suitable_items',
    });
  });

  it('passes a database outage through for the handler to report', async () => {
    const source = new MemoryAvailableWardrobeItems();
    vi.spyOn(source, 'listAvailableByOwner').mockRejectedValue(new RepositoryUnavailableError());

    await expect(new OutfitRecommendationService(source).generate(ALEX, 'work')).rejects.toBeInstanceOf(
      RepositoryUnavailableError,
    );
  });
});
