import { connection } from 'next/server';
import { handleCreateItem, handleListItems } from '@/lib/wardrobe/wardrobeHandlers';

export async function GET(req: Request): Promise<Response> {
  // Reads the session, so it must never be prerendered.
  await connection();
  return handleListItems(req);
}

export async function POST(req: Request): Promise<Response> {
  return handleCreateItem(req);
}
