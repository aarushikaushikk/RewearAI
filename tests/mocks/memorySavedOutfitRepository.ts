import type { ISavedOutfitRepository, SaveOutfitResult } from '@/lib/repositories/savedOutfitRepository';
import type { Occasion, SavedOutfitRecord } from '@/types/outfit';

interface StoredOutfit extends SavedOutfitRecord {
  isSaved: boolean;
}

function toRecord(outfit: StoredOutfit): SavedOutfitRecord {
  const { id, ownerId, occasion, itemIds, savedAt } = outfit;
  return structuredClone({ id, ownerId, occasion, itemIds, savedAt });
}

export class MemorySavedOutfitRepository implements ISavedOutfitRepository {
  private outfits: StoredOutfit[] = [];
  private nextId = 1;

  async save(ownerId: string, occasion: Occasion, itemIds: string[]): Promise<SaveOutfitResult> {
    const sorted = [...itemIds].sort();
    const now = new Date();
    const existing = this.outfits.find(
      (outfit) =>
        outfit.ownerId === ownerId &&
        outfit.occasion === occasion &&
        outfit.itemIds.join() === sorted.join(),
    );
    if (existing) {
      Object.assign(existing, { isSaved: true, savedAt: now });
      // Moves it to the end, so it lists before outfits saved in the same millisecond.
      this.outfits = [...this.outfits.filter((outfit) => outfit !== existing), existing];
      return { outfit: toRecord(existing), created: false };
    }
    const outfit: StoredOutfit = {
      id: `outfit_${this.nextId++}`,
      ownerId,
      occasion,
      itemIds: sorted,
      savedAt: now,
      isSaved: true,
    };
    this.outfits.push(outfit);
    return { outfit: toRecord(outfit), created: true };
  }

  /** Most recently saved first; ties keep reverse save order. */
  async listSavedByOwner(ownerId: string): Promise<SavedOutfitRecord[]> {
    return this.outfits
      .filter((outfit) => outfit.ownerId === ownerId && outfit.isSaved)
      .reverse()
      .sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime())
      .map(toRecord);
  }

  async unsaveForOwner(ownerId: string, outfitId: string): Promise<boolean> {
    const outfit = this.outfits.find((candidate) => candidate.id === outfitId && candidate.ownerId === ownerId);
    if (!outfit) {
      return false;
    }
    outfit.isSaved = false;
    return true;
  }
}
