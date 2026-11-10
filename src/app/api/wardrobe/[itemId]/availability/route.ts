import { handleSetAvailability } from '@/lib/wardrobe/wardrobeHandlers';

interface AvailabilityRouteContext {
  params: Promise<{ itemId: string }>;
}

/** US6: marks one of the signed-in user's items available or unavailable. */
export async function PATCH(req: Request, { params }: AvailabilityRouteContext): Promise<Response> {
  const { itemId } = await params;
  return handleSetAvailability(req, itemId);
}
