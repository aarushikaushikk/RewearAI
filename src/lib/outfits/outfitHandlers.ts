import { NextResponse } from 'next/server';
import { ConfigurationError } from '@/lib/auth/getAuthService';
import { validateCsrfOrigin } from '@/lib/auth/csrf';
import { requireAuth } from '@/lib/auth/sessionHelper';
import { getProductionOutfitRecommendationService } from '@/lib/outfits/getOutfitRecommendationService';
import { RepositoryUnavailableError } from '@/lib/repositories/repositoryErrors';
import { parseGenerateOutfitPayload } from '@/lib/validation/outfitValidation';
import { AuthError, AuthService } from '@/services/authService';
import { OutfitRecommendationService } from '@/services/outfitRecommendationService';

export interface OutfitHandlerDeps {
  authService?: AuthService;
  outfitService?: OutfitRecommendationService;
}

/** Shared by every outfit route, so an outage reads the same everywhere. */
export const GENERIC_503_ERROR = 'The outfit service is temporarily unavailable. Please try again later.';

function errorResponse(error: string, status: number): Response {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * Maps a thrown error to a safe response. Only fixed messages are sent; anything unexpected
 * is logged by name only, as in the wardrobe handlers.
 */
function failureResponse(err: unknown): Response {
  if (err instanceof AuthError) {
    return errorResponse(err.message, err.statusCode);
  }
  if (err instanceof RepositoryUnavailableError || err instanceof ConfigurationError) {
    return errorResponse(GENERIC_503_ERROR, 503);
  }
  console.error('[outfits] request failed', {
    operation: 'generate',
    category: err instanceof Error ? err.name : 'unknown',
  });
  return errorResponse('Internal server error', 500);
}

/** POST /api/outfits/generate with `{ occasion, shown? }`. Nothing is saved (US9). */
export async function handleGenerateOutfit(req: Request, deps?: OutfitHandlerDeps): Promise<Response> {
  // 1. Strict CSRF Protection
  if (!validateCsrfOrigin(req)) {
    return errorResponse('CSRF validation failed: origin mismatch or missing security headers', 403);
  }

  try {
    // 2. Authenticate; whose wardrobe is used comes only from the session
    const { user } = await requireAuth(req, deps?.authService);

    // 3. Accept { occasion, shown? }, with no user ID; shown IDs only rule combinations out
    const input = parseGenerateOutfitPayload(await req.json().catch(() => undefined));
    if (!input.ok) {
      return errorResponse(input.error, 400);
    }

    // 4. Generate; an insufficient wardrobe or no alternative is a normal 200 result, not an error
    const outfitService = deps?.outfitService || getProductionOutfitRecommendationService();
    const recommendation = await outfitService.generate(user.id, input.occasion, input.shown);
    return NextResponse.json({ success: true, data: recommendation });
  } catch (err) {
    return failureResponse(err);
  }
}
