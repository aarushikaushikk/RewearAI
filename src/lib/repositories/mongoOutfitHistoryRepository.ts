import 'server-only';
import { Outfit } from '@/models/Outfit';
import { OutfitHistory } from '@/models/OutfitHistory';
import type { Occasion } from '@/types/outfit';
import { isObjectIdString, withDatabase } from './mongoSupport';
import type {
  IOutfitHistoryRepository,
  NewOutfitData,
  NewWornEntry,
  OutfitHistoryEntryRecord,
  StoredOutfitRef,
} from './outfitHistoryRepository';
import { RepositoryError } from './repositoryErrors';

interface StoredId {
  toString(): string;
}

interface StoredEntry {
  _id: StoredId;
  owner: StoredId;
  outfit: StoredId;
  wornOn: string;
  combinationKey: string;
  createdAt: Date;
}

interface StoredOutfit {
  _id: StoredId;
  occasion: Occasion;
  items: StoredId[];
}

const DUPLICATE_KEY_CODE = 11000;

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === DUPLICATE_KEY_CODE;
}

/** Newest worn date first, then the latest recorded, then the latest ID, so ties never reorder. */
const NEWEST_FIRST = { wornOn: -1, createdAt: -1, _id: -1 } as const;

export class MongoOutfitHistoryRepository implements IOutfitHistoryRepository {
  async findOrCreateOutfit(data: NewOutfitData): Promise<StoredOutfitRef> {
    if (!isObjectIdString(data.ownerId) || !data.itemIds.every(isObjectIdString)) {
      throw new RepositoryError();
    }
    return withDatabase('outfitHistory.findOrCreateOutfit', async () => {
      // Exactly these items in any order: all of them, and no others.
      const existing = await Outfit.findOne({
        owner: data.ownerId,
        occasion: data.occasion,
        items: { $all: data.itemIds, $size: data.itemIds.length },
      })
        .sort({ createdAt: 1, _id: 1 })
        .select({ _id: 1 })
        .lean();
      if (existing) {
        return { id: existing._id.toString(), created: false };
      }
      const created = await Outfit.create({
        owner: data.ownerId,
        items: data.itemIds,
        occasion: data.occasion,
        explanation: data.explanation,
        isSaved: false,
      });
      return { id: created._id.toString(), created: true };
    });
  }

  async recordWorn(entry: NewWornEntry): Promise<{ entry: OutfitHistoryEntryRecord; created: boolean }> {
    if (!isObjectIdString(entry.ownerId) || !isObjectIdString(entry.outfitId)) {
      throw new RepositoryError();
    }
    return withDatabase('outfitHistory.recordWorn', async () => {
      // Only the owner's own outfit can be recorded. Outfits are never deleted, so the check
      // can't be invalidated before the insert below.
      if (!(await Outfit.exists({ _id: entry.outfitId, owner: entry.ownerId }))) {
        throw new RepositoryError();
      }
      try {
        const created = await OutfitHistory.create({
          owner: entry.ownerId,
          outfit: entry.outfitId,
          wornOn: entry.wornOn,
          combinationKey: entry.combinationKey,
        });
        const [record] = await this.withOutfits(entry.ownerId, [created.toObject() as StoredEntry]);
        return { entry: record, created: true };
      } catch (err) {
        // The unique index refused a second record for these clothes on this date, perhaps
        // from a concurrent request. Anything else is a real failure.
        if (!isDuplicateKeyError(err)) {
          throw err;
        }
      }
      const existing = await OutfitHistory.findOne({
        owner: entry.ownerId,
        wornOn: entry.wornOn,
        combinationKey: entry.combinationKey,
      }).lean<StoredEntry>();
      if (!existing) {
        throw new RepositoryError();
      }
      const [record] = await this.withOutfits(entry.ownerId, [existing]);
      return { entry: record, created: false };
    });
  }

  async listByOwner(ownerId: string): Promise<OutfitHistoryEntryRecord[]> {
    if (!isObjectIdString(ownerId)) {
      return [];
    }
    return withDatabase('outfitHistory.listByOwner', async () => {
      const entries = await OutfitHistory.find({ owner: ownerId }).sort(NEWEST_FIRST).lean<StoredEntry[]>();
      return this.withOutfits(ownerId, entries);
    });
  }

  /** Attaches each entry's outfit, loading only outfits that belong to `ownerId`. */
  private async withOutfits(ownerId: string, entries: StoredEntry[]): Promise<OutfitHistoryEntryRecord[]> {
    const outfitIds = [...new Set(entries.map((e) => e.outfit.toString()))];
    const outfits =
      outfitIds.length === 0
        ? []
        : await Outfit.find({ _id: { $in: outfitIds }, owner: ownerId })
            .select({ occasion: 1, items: 1 })
            .lean<StoredOutfit[]>();
    const byId = new Map(outfits.map((o) => [o._id.toString(), o]));

    return entries.map((e) => {
      const outfit = byId.get(e.outfit.toString());
      return {
        id: e._id.toString(),
        ownerId: e.owner.toString(),
        outfitId: e.outfit.toString(),
        wornOn: e.wornOn,
        combinationKey: e.combinationKey,
        recordedAt: e.createdAt,
        outfit: outfit ? { occasion: outfit.occasion, itemIds: outfit.items.map(String) } : null,
      };
    });
  }
}
