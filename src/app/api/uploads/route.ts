import { handleUploadImage } from '@/lib/wardrobe/wardrobeHandlers';

export async function POST(req: Request): Promise<Response> {
  return handleUploadImage(req);
}
