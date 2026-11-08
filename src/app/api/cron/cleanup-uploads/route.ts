import { connection } from 'next/server';
import { handleCleanupUploads } from '@/lib/wardrobe/wardrobeHandlers';

export async function GET(req: Request): Promise<Response> {
  // Must run per request: a prerendered response would skip the cleanup.
  await connection();
  return handleCleanupUploads(req);
}
