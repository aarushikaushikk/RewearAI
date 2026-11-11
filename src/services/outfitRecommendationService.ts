import { generateOutfit } from '@/services/outfits/generateOutfit';
import type { Occasion, OutfitItemDto, OutfitRecommendationDto } from '@/types/outfit';
import type { WardrobeItemRecord } from '@/types/wardrobe';

/**
 * Where generation gets its candidates. US6's IWardrobeItemRepository has a method with this
 * exact name and meaning, so once US6 is merged its repository can be passed in directly.
 */
export interface AvailableWardrobeItemSource {
  /** The owner's available items, newest first. */
  listAvailableByOwner(ownerId: string): Promise<WardrobeItemRecord[]>;
}

/**
 * US7: recommends an outfit for an occasion from the user's own available clothing. All
 * outfit rules live in generateOutfit; this service only loads candidates and shapes the
 * response. Nothing is saved (US9).
 */
export class OutfitRecommendationService {
  constructor(private items: AvailableWardrobeItemSource) {}

  async generate(userId: string, occasion: Occasion): Promise<OutfitRecommendationDto> {
    const candidates = await this.items.listAvailableByOwner(userId);
    // generateOutfit filters by owner and availability again, so a faulty source can't leak items.
    const result = generateOutfit({ userId, occasion, items: candidates });
    if (result.status === 'insufficient') {
      return result;
    }
    return {
      status: 'ok',
      occasion: result.occasion,
      season: result.season,
      items: result.pieces.map(({ role, item }): OutfitItemDto => ({
        role,
        id: item.id,
        name: item.name,
        image: { url: item.image.url },
        category: item.category,
        color: item.color,
        style: item.style,
        season: item.season,
        formality: item.formality,
      })),
    };
  }
}
