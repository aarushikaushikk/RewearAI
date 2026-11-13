import type {
  IOutfitHistoryRepository,
  NewOutfitData,
  NewWornEntry,
  OutfitHistoryEntryRecord,
  StoredOutfitRef,
} from '@/lib/repositories/outfitHistoryRepository';
import { RepositoryError } from '@/lib/repositories/repositoryErrors';
import { canonicalItemIds } from '@/services/outfitHistory/outfitCombination';
import type { Occasion } from '@/types/outfit';

interface MemoryOutfit {
  id: string;
  ownerId: string;
  itemIds: string[];
  occasion: Occasion;
  explanation: string;
}

type MemoryEntry = Omit<OutfitHistoryEntryRecord, 'outfit'>;

function sameItems(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/**
 * In-memory IOutfitHistoryRepository. Each check-and-insert runs without an `await`
 * in between, so concurrent calls behave like the MongoDB unique index.
 */
export class MemoryOutfitHistoryRepository implements IOutfitHistoryRepository {
  private outfits: MemoryOutfit[] = [];
  private entries: MemoryEntry[] = [];
  private nextId = 1;
  private clock = 0;

  async findOrCreateOutfit(data: NewOutfitData): Promise<StoredOutfitRef> {
    const existing = this.outfits.find(
      (o) => o.ownerId === data.ownerId && o.occasion === data.occasion && sameItems(o.itemIds, data.itemIds),
    );
    if (existing) {
      return { id: existing.id, created: false };
    }
    const outfit: MemoryOutfit = {
      id: `outfit_${this.nextId++}`,
      ...structuredClone(data),
      itemIds: canonicalItemIds(data.itemIds),
    };
    this.outfits.push(outfit);
    return { id: outfit.id, created: true };
  }

  async recordWorn(entry: NewWornEntry): Promise<{ entry: OutfitHistoryEntryRecord; created: boolean }> {
    if (!this.outfits.some((o) => o.id === entry.outfitId && o.ownerId === entry.ownerId)) {
      throw new RepositoryError();
    }
    const existing = this.entries.find(
      (e) => e.ownerId === entry.ownerId && e.wornOn === entry.wornOn && e.combinationKey === entry.combinationKey,
    );
    if (existing) {
      return { entry: this.withOutfit(existing), created: false };
    }
    // Strictly increasing, so records made in the same millisecond still have an order.
    const stored: MemoryEntry = {
      id: `history_${String(this.nextId++).padStart(6, '0')}`,
      ...entry,
      recordedAt: new Date(Date.UTC(2026, 10, 1) + this.clock++),
    };
    this.entries.push(stored);
    return { entry: this.withOutfit(stored), created: true };
  }

  async listByOwner(ownerId: string): Promise<OutfitHistoryEntryRecord[]> {
    return this.entries
      .filter((e) => e.ownerId === ownerId)
      .sort(
        (a, b) =>
          b.wornOn.localeCompare(a.wornOn) ||
          b.recordedAt.getTime() - a.recordedAt.getTime() ||
          b.id.localeCompare(a.id),
      )
      .map((e) => this.withOutfit(e));
  }

  private withOutfit(entry: MemoryEntry): OutfitHistoryEntryRecord {
    const outfit = this.outfits.find((o) => o.id === entry.outfitId && o.ownerId === entry.ownerId);
    return structuredClone({
      ...entry,
      outfit: outfit ? { occasion: outfit.occasion, itemIds: outfit.itemIds } : null,
    });
  }
}
