import { connection } from 'next/server';
import { handleListOutfitHistory, handleMarkOutfitWorn } from '@/lib/outfits/outfitHistoryHandlers';

export async function GET(req: Request): Promise<Response> {
  // Reads the session, so it must never be prerendered.
  await connection();
  return handleListOutfitHistory(req);
}

export async function POST(req: Request): Promise<Response> {
  return handleMarkOutfitWorn(req);
}
