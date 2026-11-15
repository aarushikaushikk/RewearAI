import { NextResponse } from 'next/server';
import { ConfigurationError } from '@/lib/auth/getAuthService';
import { validateCsrfOrigin } from '@/lib/auth/csrf';
import { requireAuth } from '@/lib/auth/sessionHelper';
import { GENERIC_503_ERROR } from '@/lib/outfits/outfitHandlers';
import { getProductionSavedOutfitService } from '@/lib/outfits/getSavedOutfitService';
import { RepositoryUnavailableError } from '@/lib/repositories/repositoryErrors';
import { INVALID_PAYLOAD_ERROR, parseSaveOutfitPayload } from '@/lib/validation/outfitValidation';
import { AuthError, AuthService } from '@/services/authService';
import { SavedOutfitError, SavedOutfitService } from '@/services/savedOutfitService';

export interface SavedOutfitHandlerDeps {
  authService?: AuthService;
  savedOutfitService?: SavedOutfitService;
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
function failureResponse(err: unknown, operation: 'save' | 'list' | 'unsave'): Response {
  if (err instanceof SavedOutfitError || err instanceof AuthError) {
    return errorResponse(err.message, err.statusCode);
  }
  if (err instanceof RepositoryUnavailableError || err instanceof ConfigurationError) {
    return errorResponse(GENERIC_503_ERROR, 503);
  }
  console.error('[outfits] request failed', {
    operation,
    category: err instanceof Error ? err.name : 'unknown',
  });
  return errorResponse('Internal server error', 500);
}

function serviceFrom(deps?: SavedOutfitHandlerDeps): SavedOutfitService {
  return deps?.savedOutfitService || getProductionSavedOutfitService();
}

/** POST /api/outfits/saved with exactly `{ occasion, itemIds }` (US9). A retry answers 200. */
export async function handleSaveOutfit(req: Request, deps?: SavedOutfitHandlerDeps): Promise<Response> {
  // 1. Strict CSRF Protection
  if (!validateCsrfOrigin(req)) {
    return csrfFailure();
  }

  try {
    // 2. Authenticate; the owner always comes from the session
    const { user } = await requireAuth(req, deps?.authService);

    // 3. Reject anything but { occasion, itemIds }
    const input = parseSaveOutfitPayload(await req.json().catch(() => undefined));
    if (!input.ok) {
      return errorResponse(INVALID_PAYLOAD_ERROR, 400);
    }

    // 4. Save; every item must be the user's own
    const { outfit, created } = await serviceFrom(deps).save(user.id, {
      occasion: input.occasion,
      itemIds: input.itemIds,
    });
    return NextResponse.json({ success: true, data: outfit }, { status: created ? 201 : 200 });
  } catch (err) {
    return failureResponse(err, 'save');
  }
}

/** GET /api/outfits/saved: the signed-in user's saved outfits, most recently saved first. */
export async function handleListSavedOutfits(req: Request, deps?: SavedOutfitHandlerDeps): Promise<Response> {
  try {
    const { user } = await requireAuth(req, deps?.authService);
    const outfits = await serviceFrom(deps).listSaved(user.id);
    return NextResponse.json({ success: true, data: outfits });
  } catch (err) {
    return failureResponse(err, 'list');
  }
}

/** DELETE /api/outfits/saved/[outfitId]: takes the outfit off the saved list; 404 for another user's. */
export async function handleUnsaveOutfit(
  req: Request,
  outfitId: string,
  deps?: SavedOutfitHandlerDeps,
): Promise<Response> {
  if (!validateCsrfOrigin(req)) {
    return csrfFailure();
  }

  try {
    const { user } = await requireAuth(req, deps?.authService);
    await serviceFrom(deps).unsave(user.id, outfitId);
    return NextResponse.json({ success: true, data: { id: outfitId } });
  } catch (err) {
    return failureResponse(err, 'unsave');
  }
}
