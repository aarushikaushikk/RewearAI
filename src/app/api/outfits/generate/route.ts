import { handleGenerateOutfit } from '@/lib/outfits/outfitHandlers';

export async function POST(req: Request): Promise<Response> {
  return handleGenerateOutfit(req);
}
