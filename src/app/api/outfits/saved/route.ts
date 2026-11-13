import { connection } from 'next/server';
import { handleListSavedOutfits, handleSaveOutfit } from '@/lib/outfits/savedOutfitHandlers';

export async function GET(req: Request): Promise<Response> {
  // Reads the session, so it must never be prerendered.
  await connection();
  return handleListSavedOutfits(req);
}

export async function POST(req: Request): Promise<Response> {
  return handleSaveOutfit(req);
}
