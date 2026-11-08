import { handleCreateItem } from '@/lib/wardrobe/wardrobeHandlers';

export async function POST(req: Request): Promise<Response> {
  return handleCreateItem(req);
}
