import 'server-only';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { WardrobeImage } from '@/types/wardrobe';
import { IImageStore, ImageStoreError, PendingImage } from './imageStore';

export interface CloudinarySettings {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/** Reads the Cloudinary settings, or returns null if any is missing. */
export function readCloudinarySettings(): CloudinarySettings | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
}

// The SDK rejects with `{ error: { http_code } }` rather than an Error.
function isNotFound(err: unknown): boolean {
  const httpCode =
    (err as { http_code?: number } | null)?.http_code ??
    (err as { error?: { http_code?: number } } | null)?.error?.http_code;
  return httpCode === 404;
}

export class CloudinaryImageStore implements IImageStore {
  constructor(settings: CloudinarySettings) {
    cloudinary.config({
      cloud_name: settings.cloudName,
      api_key: settings.apiKey,
      api_secret: settings.apiSecret,
      secure: true,
    });
  }

  async upload(bytes: Uint8Array, options: { folder: string; tags: string[] }): Promise<WardrobeImage> {
    return this.run(async () => {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: 'image',
            folder: options.folder,
            tags: options.tags,
            allowed_formats: ['jpg', 'png', 'webp'],
          },
          (error, response) => {
            if (error || !response) {
              reject(error ?? new Error('Empty upload response'));
            } else {
              resolve(response);
            }
          },
        );
        stream.end(Buffer.from(bytes));
      });
      return { url: result.secure_url, publicId: result.public_id };
    });
  }

  async find(publicId: string): Promise<WardrobeImage | null> {
    return this.run(async () => {
      try {
        const resource = await cloudinary.api.resource(publicId);
        return { url: resource.secure_url, publicId: resource.public_id };
      } catch (err) {
        if (isNotFound(err)) {
          return null;
        }
        throw err;
      }
    });
  }

  async listByTag(
    tag: string,
    cursor?: string,
  ): Promise<{ images: PendingImage[]; nextCursor?: string }> {
    return this.run(async () => {
      const response = await cloudinary.api.resources_by_tag(tag, {
        max_results: 500,
        next_cursor: cursor,
      });
      return {
        images: response.resources.map((resource) => ({
          publicId: resource.public_id,
          createdAt: new Date(resource.created_at),
        })),
        nextCursor: response.next_cursor || undefined,
      };
    });
  }

  async delete(publicIds: string[]): Promise<void> {
    await this.run(() => cloudinary.api.delete_resources(publicIds));
  }

  async removeTag(tag: string, publicIds: string[]): Promise<void> {
    await this.run(() => cloudinary.uploader.remove_tag(tag, publicIds));
  }

  /** Replaces any SDK failure, whose message can include credentials, with ImageStoreError. */
  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      throw new ImageStoreError();
    }
  }
}
