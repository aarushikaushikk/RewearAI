import 'server-only';
import { ConfigurationError } from '@/lib/auth/getAuthService';
import { MongoOutfitHistoryRepository } from '@/lib/repositories/mongoOutfitHistoryRepository';
import { MongoWardrobeItemRepository } from '@/lib/repositories/mongoWardrobeItemRepository';
import { OutfitHistoryService } from '@/services/outfitHistoryService';

/**
 * Returns an OutfitHistoryService backed by MongoDB. Fails closed if the database isn't
 * configured. History only reads wardrobe items, so Cloudinary isn't needed. Only builds
 * objects; connecting happens on first use.
 */
export function getProductionOutfitHistoryService(): OutfitHistoryService {
  if (!process.env.MONGODB_URI?.trim()) {
    throw new ConfigurationError('The outfit history service is temporarily unavailable');
  }
  return new OutfitHistoryService(new MongoOutfitHistoryRepository(), new MongoWardrobeItemRepository());
}
