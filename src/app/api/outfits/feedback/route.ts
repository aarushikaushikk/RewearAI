import { handleRateOutfit } from '@/lib/outfits/outfitFeedbackHandlers';

export async function PUT(req: Request): Promise<Response> {
  return handleRateOutfit(req);
}
