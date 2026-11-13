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
      explanation: { formalities: [formality], seasons: ['All-season'], palette: 'tonal', alternative: false },
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

  it('returns an alternative to the outfits already shown (US8)', async () => {
    const [firstTop, secondTop] = [wardrobeRecord(ALEX, 'Top'), wardrobeRecord(ALEX, 'Top')];
    const bottom = wardrobeRecord(ALEX, 'Bottom');
    const service = new OutfitRecommendationService(new MemoryAvailableWardrobeItems([firstTop, secondTop, bottom]));

    const result = await service.generate(ALEX, 'casual', [[firstTop.id, bottom.id]]);

    expect(result.status === 'ok' && result.items.map((i) => i.id)).toEqual([secondTop.id, bottom.id]);
  });

  it('says so when no alternative to the shown outfits exists', async () => {
    const [top, bottom] = [wardrobeRecord(ALEX, 'Top'), wardrobeRecord(ALEX, 'Bottom')];
    const service = new OutfitRecommendationService(new MemoryAvailableWardrobeItems([top, bottom]));

    await expect(service.generate(ALEX, 'casual', [[top.id, bottom.id]])).resolves.toEqual({
      status: 'no_alternative',
      occasion: 'casual',
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

  describe('explanation facts (US13)', () => {
    it('explains the chosen pieces: formalities, seasons and palette', async () => {
      const top = wardrobeRecord(ALEX, 'Top', { formality: 'Formal', color: 'White', season: 'Autumn' });
      const bottom = wardrobeRecord(ALEX, 'Bottom', { formality: 'Smart casual', color: 'Navy' });
      const service = new OutfitRecommendationService(new MemoryAvailableWardrobeItems([top, bottom]));

      const result = await service.generate(ALEX, 'work');

      expect(result).toMatchObject({
        status: 'ok',
        explanation: {
          formalities: ['Smart casual', 'Formal'],
          seasons: ['Autumn', 'All-season'],
          palette: 'neutral',
          alternative: false,
        },
      });
    });

    it('marks an alternative generated by Try another (US8)', async () => {
      const [first, second] = [wardrobeRecord(ALEX, 'Top'), wardrobeRecord(ALEX, 'Top')];
      const bottom = wardrobeRecord(ALEX, 'Bottom');
      const service = new OutfitRecommendationService(new MemoryAvailableWardrobeItems([first, second, bottom]));

      const result = await service.generate(ALEX, 'casual', [[first.id, bottom.id]]);

      expect(result).toMatchObject({ status: 'ok', explanation: { alternative: true } });
    });

    it('has no explanation when no outfit was made', async () => {
      const service = new OutfitRecommendationService(new MemoryAvailableWardrobeItems([]));

      expect(await service.generate(ALEX, 'casual')).not.toHaveProperty('explanation');
    });
  });
});
