import { handleUnsaveOutfit } from '@/lib/outfits/savedOutfitHandlers';

interface SavedOutfitRouteContext {
  params: Promise<{ outfitId: string }>;
}

export async function DELETE(req: Request, { params }: SavedOutfitRouteContext): Promise<Response> {
  const { outfitId } = await params;
  return handleUnsaveOutfit(req, outfitId);
}
