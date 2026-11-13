import 'server-only';
import { ConfigurationError } from '@/lib/auth/getAuthService';
import { CloudinaryImageStore, readCloudinarySettings } from '@/lib/images/cloudinaryImageStore';
import { uploadScopeFor } from '@/lib/images/uploadScope';
import { MongoWardrobeItemRepository } from '@/lib/repositories/mongoWardrobeItemRepository';
import { WardrobeItemService } from '@/services/wardrobeItemService';

/**
 * Returns a WardrobeItemService backed by MongoDB and Cloudinary. Fails closed if
 * either isn't configured. Only builds objects; connecting happens on first use.
 * Not cached, for the same cross-bundle `instanceof` reason as getProductionAuthService.
 */
export function getProductionWardrobeItemService(): WardrobeItemService {
  const cloudinary = readCloudinarySettings();
  const mongodbUri = process.env.MONGODB_URI?.trim();
  if (!mongodbUri || !cloudinary) {
    throw new ConfigurationError('The wardrobe service is temporarily unavailable');
  }
  let uploadScope: string;
  try {
    uploadScope = uploadScopeFor(mongodbUri);
  } catch {
    throw new ConfigurationError('The wardrobe service is temporarily unavailable');
  }
  return new WardrobeItemService(
    new MongoWardrobeItemRepository(),
    new CloudinaryImageStore(cloudinary),
    uploadScope,
  );
}
