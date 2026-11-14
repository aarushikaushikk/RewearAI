import { handleClearOutfitFeedback } from '@/lib/outfits/outfitFeedbackHandlers';

interface OutfitFeedbackRouteContext {
  params: Promise<{ outfitId: string }>;
}

export async function DELETE(req: Request, { params }: OutfitFeedbackRouteContext): Promise<Response> {
  const { outfitId } = await params;
  return handleClearOutfitFeedback(req, outfitId);
}
