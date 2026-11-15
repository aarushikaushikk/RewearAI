import type { IOutfitFeedbackRepository } from '@/lib/repositories/outfitFeedbackRepository';
import type { IOutfitHistoryRepository } from '@/lib/repositories/outfitHistoryRepository';
import { RepositoryError } from '@/lib/repositories/repositoryErrors';
import type { OutfitFeedbackInput } from '@/lib/validation/outfitValidation';
import { isValidOutfitCombination } from '@/services/outfitHistory/outfitCombination';
import type { OwnedWardrobeItemSource } from '@/services/outfitHistoryService';
import type { OutfitFeedbackDto } from '@/types/outfit';
import type { WardrobeItemRecord } from '@/types/wardrobe';

export const FEEDBACK_ITEMS_NOT_FOUND_ERROR = 'One or more of these items are not in your wardrobe.';
export const FEEDBACK_INVALID_COMBINATION_ERROR =
  'An outfit needs a top and a bottom, or a dress, with at most one item of each category.';
export const FEEDBACK_OUTFIT_NOT_FOUND_ERROR = "We couldn't find that outfit.";

type FeedbackErrorMessage =
  | typeof FEEDBACK_ITEMS_NOT_FOUND_ERROR
  | typeof FEEDBACK_INVALID_COMBINATION_ERROR
  | typeof FEEDBACK_OUTFIT_NOT_FOUND_ERROR;

/** A request this service refuses, with a fixed message that is safe to show. */
export class OutfitFeedbackError extends Error {
  override name = 'OutfitFeedbackError';

  constructor(
    message: FeedbackErrorMessage,
    public statusCode: number,
  ) {
    super(message);
  }
}

/**
 * US14: positive or negative feedback on a recommendation, which the user can change or clear.
 * Generated outfits aren't stored, so rating one finds or creates the user's outfit with the same
 * items and occasion: the record Save (US9) and Mark as worn (US10) also use.
 */
export class OutfitFeedbackService {
  constructor(
    private outfits: Pick<IOutfitHistoryRepository, 'findOrCreateOutfit'>,
    private feedback: IOutfitFeedbackRepository,
    private items: OwnedWardrobeItemSource,
  ) {}

  /**
   * Rates an outfit of the user's own items. Every item must still be in their wardrobe;
   * availability isn't checked again, since the outfit was just recommended to them.
   */
  async rate(userId: string, input: OutfitFeedbackInput): Promise<OutfitFeedbackDto> {
    const itemIds = input.itemIds.map((id) => id.toLowerCase());
    if (new Set(itemIds).size !== itemIds.length) {
      throw new OutfitFeedbackError(FEEDBACK_INVALID_COMBINATION_ERROR, 400);
    }

    const owned = await this.ownedItemsById(userId);
    const chosen = itemIds.map((id) => owned.get(id));
    // Another user's item reads exactly like one that doesn't exist.
    if (!chosen.every((item): item is WardrobeItemRecord => item !== undefined)) {
      throw new OutfitFeedbackError(FEEDBACK_ITEMS_NOT_FOUND_ERROR, 404);
    }
    if (!isValidOutfitCombination(chosen.map((item) => item.category))) {
      throw new OutfitFeedbackError(FEEDBACK_INVALID_COMBINATION_ERROR, 400);
    }

    const outfit = await this.outfits.findOrCreateOutfit({
      ownerId: userId,
      itemIds: chosen.map((item) => item.id),
      occasion: input.occasion,
    });
    // The outfit was just found or created for this owner, so a refusal means storage is faulty.
    if (!(await this.feedback.setRating(userId, outfit.id, input.rating))) {
      throw new RepositoryError();
    }
    return { outfitId: outfit.id, rating: input.rating };
  }

  /** Clears the rating of one of the user's outfits. Another user's outfit is reported as not found. */
  async clear(userId: string, outfitId: string): Promise<void> {
    if (!(await this.feedback.clearRating(userId, outfitId))) {
      throw new OutfitFeedbackError(FEEDBACK_OUTFIT_NOT_FOUND_ERROR, 404);
    }
  }

  private async ownedItemsById(userId: string): Promise<Map<string, WardrobeItemRecord>> {
    const items = await this.items.listByOwner(userId);
    // Only the owner's items are kept, even if a faulty source returned others.
    return new Map(items.filter((item) => item.ownerId === userId).map((item) => [item.id.toLowerCase(), item]));
  }
}
