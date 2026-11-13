import type { IOutfitFeedbackRepository, RatedOutfitRecord } from '@/lib/repositories/outfitFeedbackRepository';
import { combinationKey } from '@/services/outfitHistory/outfitCombination';
import { explainOutfit } from '@/services/outfits/explainOutfit';
import { generateOutfit } from '@/services/outfits/generateOutfit';
import type { Occasion, OutfitFeedbackDto, OutfitItemDto, OutfitRecommendationDto } from '@/types/outfit';
import type { WardrobeItemRecord } from '@/types/wardrobe';

/**
 * Where generation gets its candidates. US6's IWardrobeItemRepository has a method with this
 * exact name and meaning, so once US6 is merged its repository can be passed in directly.
 */
export interface AvailableWardrobeItemSource {
  /** The owner's available items, newest first. */
  listAvailableByOwner(ownerId: string): Promise<WardrobeItemRecord[]>;
}

/** Where the user's saved feedback comes from (US14). */
export type RatedOutfitSource = Pick<IOutfitFeedbackRepository, 'listRatedByOccasion'>;

/** For callers that don't use feedback: nothing has been rated. */
const NO_FEEDBACK: RatedOutfitSource = { listRatedByOccasion: async () => [] };

/** The rating saved for exactly these items, or null. */
function feedbackFor(itemIds: string[], rated: RatedOutfitRecord[]): OutfitFeedbackDto | null {
  const key = combinationKey(itemIds);
  const match = rated.find((r) => combinationKey(r.itemIds) === key);
  return match ? { outfitId: match.outfitId, rating: match.rating } : null;
}

/**
 * US7: recommends an outfit for an occasion from the user's own available clothing, and with
 * `shown` (US8) an alternative to outfits already shown. All outfit rules live in
 * generateOutfit; this service only loads candidates and shapes the response. Nothing is
 * saved (US9). Each outfit carries the facts it was chosen on (US13), and its saved rating. A
 * combination the user marked Not helpful for the occasion is avoided when another exists (US14).
 */
export class OutfitRecommendationService {
  constructor(
    private items: AvailableWardrobeItemSource,
    private feedback: RatedOutfitSource = NO_FEEDBACK,
  ) {}

  async generate(
    userId: string,
    occasion: Occasion,
    shown: readonly (readonly string[])[] = [],
  ): Promise<OutfitRecommendationDto> {
    const [candidates, rated] = await Promise.all([
      this.items.listAvailableByOwner(userId),
      this.feedback.listRatedByOccasion(userId, occasion),
    ]);
    const disliked = rated.filter((r) => r.rating === 'negative').map((r) => r.itemIds);
    // generateOutfit filters by owner and availability again, so a faulty source can't leak items.
    const result = generateOutfit({ userId, occasion, items: candidates, shown, disliked });
    if (result.status !== 'ok') {
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
      explanation: explainOutfit(result.occasion, result.pieces, result.palette, shown.length > 0),
      feedback: feedbackFor(
        result.pieces.map(({ item }) => item.id),
        rated,
      ),
    };
  }
}
