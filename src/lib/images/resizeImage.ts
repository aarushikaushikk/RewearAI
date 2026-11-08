import { MAX_IMAGE_DIMENSION } from '@/types/upload';

const JPEG_QUALITY = 0.85;

/** Scales dimensions down to fit within `max` on the longest edge, keeping the ratio. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Browser-only. Re-encodes a photo as a JPEG no larger than MAX_IMAGE_DIMENSION, so
 * typical phone photos upload well under the size limit. Re-encoding also drops
 * EXIF metadata such as GPS location. Returns the original file if the browser
 * can't decode it, leaving the server to report the problem.
 */
export async function resizeImageForUpload(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_IMAGE_DIMENSION);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return file;
  }
  // JPEG has no transparency; paint white so transparent PNGs don't turn black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  return blob ?? file;
}
