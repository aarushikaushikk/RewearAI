import type { ISavedOutfitRepository } from '@/lib/repositories/savedOutfitRepository';
import type { IWardrobeItemRepository } from '@/lib/repositories/wardrobeItemRepository';
import type { SaveOutfitInput } from '@/lib/validation/outfitValidation';
import type { SavedOutfitDto, SavedOutfitItemDto, SavedOutfitRecord } from '@/types/outfit';
import type { Category, WardrobeItemRecord } from '@/types/wardrobe';

const ITEMS_NOT_FOUND_MESSAGE = 'Some of these items are no longer in your wardrobe. Generate a new outfit.';
const OUTFIT_NOT_FOUND_MESSAGE = "We couldn't find that saved outfit.";

/** The order items are shown in, matching how a generated outfit lists them. */
const CATEGORY_ORDER: Category[] = ['Top', 'Bottom', 'Dress', 'Outerwear', 'Shoes', 'Accessory'];

export class SavedOutfitError extends Error {
  constructor(
    message: string,
    public code: 'ITEMS_NOT_FOUND' | 'OUTFIT_NOT_FOUND',
    public statusCode: number,
  ) {
    super(message);
    this.name = 'SavedOutfitError';
  }
}

export interface SaveOutfitServiceResult {
  outfit: SavedOutfitDto;
  /** False when the same outfit was already stored, as when a save is retried. */
  created: boolean;
}

function presentItem(item: WardrobeItemRecord): SavedOutfitItemDto {
  return {
    status: 'present',
    id: item.id,
    name: item.name,
    image: { url: item.image.url },
    category: item.category,
    color: item.color,
    style: item.style,
  };
}

function orderOf(item: SavedOutfitItemDto): number {
  // Removed items have no category; they go last.
  return item.status === 'present' ? CATEGORY_ORDER.indexOf(item.category) : CATEGORY_ORDER.length;
}

/**
 * Shapes a stored outfit for display. Items are looked up in the owner's current wardrobe,
 * so an item deleted since saving is marked removed and nothing is filled in for it.
 */
function toSavedOutfitDto(outfit: SavedOutfitRecord, wardrobe: Map<string, WardrobeItemRecord>): SavedOutfitDto {
  const items = outfit.itemIds.map((id): SavedOutfitItemDto => {
    const item = wardrobe.get(id);
    return item ? presentItem(item) : { status: 'removed', id };
  });
  return {
    id: outfit.id,
    occasion: outfit.occasion,
    savedAt: outfit.savedAt.toISOString(),
    items: items.sort((a, b) => orderOf(a) - orderOf(b)),
  };
}

/** US9: save outfit recommendations, list them, and remove them from the saved list. */
export class SavedOutfitService {
  constructor(
    private outfits: ISavedOutfitRepository,
    private items: IWardrobeItemRepository,
  ) {}

  /**
   * Saves an outfit of the user's own items. Every item must still be in their wardrobe;
   * availability isn't checked again, since the outfit was just recommended to them.
   */
  async save(userId: string, input: SaveOutfitInput): Promise<SaveOutfitServiceResult> {
    const wardrobe = await this.wardrobeOf(userId);
    if (!input.itemIds.every((id) => wardrobe.has(id))) {
      throw new SavedOutfitError(ITEMS_NOT_FOUND_MESSAGE, 'ITEMS_NOT_FOUND', 400);
    }
    const { outfit, created } = await this.outfits.save(userId, input.occasion, input.itemIds);
    return { outfit: toSavedOutfitDto(outfit, wardrobe), created };
  }

  /** The user's saved outfits, most recently saved first. */
  async listSaved(userId: string): Promise<SavedOutfitDto[]> {
    const outfits = await this.outfits.listSavedByOwner(userId);
    if (outfits.length === 0) {
      return [];
    }
    const wardrobe = await this.wardrobeOf(userId);
    return outfits.map((outfit) => toSavedOutfitDto(outfit, wardrobe));
  }

  /** Takes an outfit off the saved list. Another user's outfit is reported as not found. */
  async unsave(userId: string, outfitId: string): Promise<void> {
    if (!(await this.outfits.unsaveForOwner(userId, outfitId))) {
      throw new SavedOutfitError(OUTFIT_NOT_FOUND_MESSAGE, 'OUTFIT_NOT_FOUND', 404);
    }
  }

  private async wardrobeOf(userId: string): Promise<Map<string, WardrobeItemRecord>> {
    const items = await this.items.listByOwner(userId);
    return new Map(items.map((item) => [item.id, item]));
  }
}
