import 'server-only';
import { ConfigurationError } from '@/lib/auth/getAuthService';
import { MongoSavedOutfitRepository } from '@/lib/repositories/mongoSavedOutfitRepository';
import { MongoWardrobeItemRepository } from '@/lib/repositories/mongoWardrobeItemRepository';
import { SavedOutfitService } from '@/services/savedOutfitService';

/**
 * Returns a SavedOutfitService backed by MongoDB. Fails closed if the database isn't
 * configured. Only builds objects; connecting happens on first use.
 */
export function getProductionSavedOutfitService(): SavedOutfitService {
  if (!process.env.MONGODB_URI?.trim()) {
    throw new ConfigurationError('The outfit service is temporarily unavailable');
  }
  return new SavedOutfitService(new MongoSavedOutfitRepository(), new MongoWardrobeItemRepository());
}
