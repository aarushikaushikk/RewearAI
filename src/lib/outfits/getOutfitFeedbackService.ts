import 'server-only';
import { ConfigurationError } from '@/lib/auth/getAuthService';
import { MongoOutfitFeedbackRepository } from '@/lib/repositories/mongoOutfitFeedbackRepository';
import { MongoOutfitHistoryRepository } from '@/lib/repositories/mongoOutfitHistoryRepository';
import { MongoWardrobeItemRepository } from '@/lib/repositories/mongoWardrobeItemRepository';
import { OutfitFeedbackService } from '@/services/outfitFeedbackService';

/**
 * Returns an OutfitFeedbackService backed by MongoDB. Fails closed if the database isn't
 * configured. Only builds objects; connecting happens on first use.
 */
export function getProductionOutfitFeedbackService(): OutfitFeedbackService {
  if (!process.env.MONGODB_URI?.trim()) {
    throw new ConfigurationError('The outfit feedback service is temporarily unavailable');
  }
  return new OutfitFeedbackService(
    new MongoOutfitHistoryRepository(),
    new MongoOutfitFeedbackRepository(),
    new MongoWardrobeItemRepository(),
  );
}
