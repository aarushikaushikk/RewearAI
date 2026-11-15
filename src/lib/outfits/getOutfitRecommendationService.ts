import 'server-only';
import { ConfigurationError } from '@/lib/auth/getAuthService';
import { MongoAvailableWardrobeItems } from '@/lib/outfits/mongoAvailableWardrobeItems';
import { MongoOutfitFeedbackRepository } from '@/lib/repositories/mongoOutfitFeedbackRepository';
import { OutfitRecommendationService } from '@/services/outfitRecommendationService';

/**
 * Returns an OutfitRecommendationService backed by MongoDB. Fails closed if the database
 * isn't configured. Only builds objects; connecting happens on first use.
 */
export function getProductionOutfitRecommendationService(): OutfitRecommendationService {
  if (!process.env.MONGODB_URI?.trim()) {
    throw new ConfigurationError('The outfit service is temporarily unavailable');
  }
  return new OutfitRecommendationService(new MongoAvailableWardrobeItems(), new MongoOutfitFeedbackRepository());
}
