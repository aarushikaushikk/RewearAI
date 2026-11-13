import type {
  IOutfitHistoryRepository,
  OutfitHistoryEntryRecord,
} from '@/lib/repositories/outfitHistoryRepository';
import {
  combinationKey,
  describeWornOutfit,
  isValidOutfitCombination,
  OUTFIT_CATEGORY_ORDER,
} from '@/services/outfitHistory/outfitCombination';
import type {
  MarkOutfitWornInput,
  MarkOutfitWornResultDto,
  MissingWornItemDto,
  OutfitHistoryEntryDto,
  WornItemDto,
} from '@/types/outfitHistory';
import type { WardrobeItemRecord } from '@/types/wardrobe';

/**
 * Where the user's own wardrobe items come from. US6's IWardrobeItemRepository has this
 * method, scoped to the owner, so its repositories can be passed in directly.
 */
export interface OwnedWardrobeItemSource {
  listByOwner(ownerId: string): Promise<WardrobeItemRecord[]>;
}

export const ITEMS_NOT_FOUND_ERROR = 'One or more of these items are not in your wardrobe.';
export const INVALID_COMBINATION_ERROR =
  'An outfit needs a top and a bottom, or a dress, with at most one item of each category.';

/** A request this service refuses, with a fixed message that is safe to show. */
export class OutfitHistoryError extends Error {
  override name = 'OutfitHistoryError';

  constructor(
    message: typeof ITEMS_NOT_FOUND_ERROR | typeof INVALID_COMBINATION_ERROR,
    public statusCode: number,
  ) {
    super(message);
  }
}

function presentItem(item: WardrobeItemRecord): WornItemDto {
  return {
    status: 'present',
    id: item.id,
    name: item.name,
    image: { url: item.image.url },
    category: item.category,
    color: item.color,
    style: item.style,
    season: item.season,
    formality: item.formality,
  };
}

/** Outfit order: by category, and an item no longer in the wardrobe, whose category is unknown, last. */
function displayRank(item: WornItemDto | MissingWornItemDto): number {
  return item.status === 'present' ? OUTFIT_CATEGORY_ORDER.indexOf(item.category) : OUTFIT_CATEGORY_ORDER.length;
}

/**
 * US10: records outfits as worn and lists them, newest first. Clothing details always come
 * from the user's own wardrobe, never from the request, and are read again for every
 * listing, so a deleted item shows as missing rather than being invented or hidden.
 */
export class OutfitHistoryService {
  constructor(
    private history: IOutfitHistoryRepository,
    private items: OwnedWardrobeItemSource,
  ) {}

  async markWorn(userId: string, input: MarkOutfitWornInput): Promise<MarkOutfitWornResultDto> {
    const itemIds = input.itemIds.map((id) => id.toLowerCase());
    if (new Set(itemIds).size !== itemIds.length) {
      throw new OutfitHistoryError(INVALID_COMBINATION_ERROR, 400);
    }

    const owned = await this.ownedItemsById(userId);
    const chosen = itemIds.map((id) => owned.get(id));
    // Another user's item reads exactly like one that doesn't exist.
    if (!chosen.every((item): item is WardrobeItemRecord => item !== undefined)) {
      throw new OutfitHistoryError(ITEMS_NOT_FOUND_ERROR, 404);
    }
    if (!isValidOutfitCombination(chosen.map((item) => item.category))) {
      throw new OutfitHistoryError(INVALID_COMBINATION_ERROR, 400);
    }

    const outfit = await this.history.findOrCreateOutfit({
      ownerId: userId,
      itemIds: chosen.map((item) => item.id),
      occasion: input.occasion,
      explanation: describeWornOutfit(input.occasion, chosen),
    });
    const { entry, created } = await this.history.recordWorn({
      ownerId: userId,
      outfitId: outfit.id,
      wornOn: input.wornOn,
      combinationKey: combinationKey(itemIds),
    });
    return { created, entry: this.toDto(entry, owned) };
  }

  async list(userId: string): Promise<OutfitHistoryEntryDto[]> {
    const [entries, owned] = await Promise.all([this.history.listByOwner(userId), this.ownedItemsById(userId)]);
    return entries.map((entry) => this.toDto(entry, owned));
  }

  private async ownedItemsById(userId: string): Promise<Map<string, WardrobeItemRecord>> {
    const items = await this.items.listByOwner(userId);
    // Only the owner's items are kept, even if a faulty source returned others.
    return new Map(items.filter((item) => item.ownerId === userId).map((item) => [item.id.toLowerCase(), item]));
  }

  private toDto(entry: OutfitHistoryEntryRecord, owned: Map<string, WardrobeItemRecord>): OutfitHistoryEntryDto {
    // The key holds the same IDs if the outfit record is gone, so the items are still known.
    const itemIds = entry.outfit?.itemIds ?? entry.combinationKey.split(',');
    const items = itemIds.map((id): WornItemDto | MissingWornItemDto => {
      const item = owned.get(id.toLowerCase());
      return item ? presentItem(item) : { status: 'missing', id };
    });
    return {
      id: entry.id,
      wornOn: entry.wornOn,
      occasion: entry.outfit?.occasion ?? null,
      recordedAt: entry.recordedAt.toISOString(),
      // Stored IDs are sorted, which says nothing about the clothes; show them in outfit order.
      // The sort is stable, so items of one rank keep their stored order.
      items: items.sort((a, b) => displayRank(a) - displayRank(b)),
    };
  }
}
