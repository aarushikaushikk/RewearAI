import { NextResponse } from 'next/server';
import { ConfigurationError } from '@/lib/auth/getAuthService';
import { validateCsrfOrigin } from '@/lib/auth/csrf';
import { requireAuth } from '@/lib/auth/sessionHelper';
import { getProductionOutfitFeedbackService } from '@/lib/outfits/getOutfitFeedbackService';
import { GENERIC_503_ERROR } from '@/lib/outfits/outfitHandlers';
import { RepositoryUnavailableError } from '@/lib/repositories/repositoryErrors';
import { INVALID_PAYLOAD_ERROR, parseOutfitFeedbackPayload } from '@/lib/validation/outfitValidation';
import { AuthError, AuthService } from '@/services/authService';
import { OutfitFeedbackError, OutfitFeedbackService } from '@/services/outfitFeedbackService';

export interface OutfitFeedbackHandlerDeps {
  authService?: AuthService;
  outfitFeedbackService?: OutfitFeedbackService;
}

function errorResponse(error: string, status: number): Response {
  return NextResponse.json({ success: false, error }, { status });
}

function csrfFailure(): Response {
  return errorResponse('CSRF validation failed: origin mismatch or missing security headers', 403);
}

/**
 * Maps a thrown error to a safe response. Only fixed or service-chosen messages are sent;
 * anything unexpected is logged by name only.
 */
function failureResponse(err: unknown, operation: 'rate' | 'clear'): Response {
  if (err instanceof OutfitFeedbackError || err instanceof AuthError) {
    return errorResponse(err.message, err.statusCode);
  }
  if (err instanceof RepositoryUnavailableError || err instanceof ConfigurationError) {
    return errorResponse(GENERIC_503_ERROR, 503);
  }
  console.error('[outfits] feedback request failed', {
    operation,
    category: err instanceof Error ? err.name : 'unknown',
  });
  return errorResponse('Internal server error', 500);
}

function serviceFrom(deps?: OutfitFeedbackHandlerDeps): OutfitFeedbackService {
  return deps?.outfitFeedbackService || getProductionOutfitFeedbackService();
}

/** PUT /api/outfits/feedback with exactly `{ occasion, itemIds, rating }` (US14). A retry or change answers 200. */
export async function handleRateOutfit(req: Request, deps?: OutfitFeedbackHandlerDeps): Promise<Response> {
  // 1. Strict CSRF Protection
  if (!validateCsrfOrigin(req)) {
    return csrfFailure();
  }

  try {
    // 2. Authenticate; the owner always comes from the session
    const { user } = await requireAuth(req, deps?.authService);

    // 3. Reject anything but { occasion, itemIds, rating }
    const input = parseOutfitFeedbackPayload(await req.json().catch(() => undefined));
    if (!input.ok) {
      return errorResponse(INVALID_PAYLOAD_ERROR, 400);
    }

    // 4. Rate; every item must be the user's own
    const feedback = await serviceFrom(deps).rate(user.id, {
      occasion: input.occasion,
      itemIds: input.itemIds,
      rating: input.rating,
    });
    return NextResponse.json({ success: true, data: feedback });
  } catch (err) {
    return failureResponse(err, 'rate');
  }
}

/** DELETE /api/outfits/feedback/[outfitId]: clears the rating; 404 for another user's outfit. */
export async function handleClearOutfitFeedback(
  req: Request,
  outfitId: string,
  deps?: OutfitFeedbackHandlerDeps,
): Promise<Response> {
  if (!validateCsrfOrigin(req)) {
    return csrfFailure();
  }

  try {
    const { user } = await requireAuth(req, deps?.authService);
    await serviceFrom(deps).clear(user.id, outfitId);
    return NextResponse.json({ success: true, data: { outfitId } });
  } catch (err) {
    return failureResponse(err, 'clear');
  }
}
