import { NextResponse } from 'next/server';
import { ConfigurationError } from '@/lib/auth/getAuthService';
import { validateCsrfOrigin } from '@/lib/auth/csrf';
import { requireAuth } from '@/lib/auth/sessionHelper';
import { getProductionOutfitHistoryService } from '@/lib/outfits/getOutfitHistoryService';
import { RepositoryUnavailableError } from '@/lib/repositories/repositoryErrors';
import { parseMarkWornPayload } from '@/lib/validation/outfitHistoryValidation';
import { AuthError, AuthService } from '@/services/authService';
import { OutfitHistoryError, OutfitHistoryService } from '@/services/outfitHistoryService';
import type { MarkOutfitWornResultDto, OutfitHistoryListDto } from '@/types/outfitHistory';

export interface OutfitHistoryHandlerDeps {
  authService?: AuthService;
  historyService?: OutfitHistoryService;
  /** The current time, for checking the worn date. */
  now?: () => Date;
}

const GENERIC_503_ERROR = 'The outfit history service is temporarily unavailable. Please try again later.';

type Operation = 'markWorn' | 'list';

function errorResponse(error: string, status: number): Response {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * Maps a thrown error to a safe response. Only fixed messages are sent; anything unexpected
 * is logged by name only, as in the other outfit and wardrobe handlers.
 */
function failureResponse(err: unknown, operation: Operation): Response {
  if (err instanceof AuthError || err instanceof OutfitHistoryError) {
    return errorResponse(err.message, err.statusCode);
  }
  if (err instanceof RepositoryUnavailableError || err instanceof ConfigurationError) {
    return errorResponse(GENERIC_503_ERROR, 503);
  }
  console.error('[outfit-history] request failed', {
    operation,
    category: err instanceof Error ? err.name : 'unknown',
  });
  return errorResponse('Internal server error', 500);
}

/**
 * POST /api/outfits/history with exactly `{ itemIds, occasion, wornOn }`: records the outfit
 * as worn. 201 for a new record; 200 with the existing one if these clothes were already
 * recorded that day, so a retry never duplicates it.
 */
export async function handleMarkOutfitWorn(req: Request, deps?: OutfitHistoryHandlerDeps): Promise<Response> {
  // 1. Strict CSRF Protection
  if (!validateCsrfOrigin(req)) {
    return errorResponse('CSRF validation failed: origin mismatch or missing security headers', 403);
  }

  try {
    // 2. Authenticate; whose history and wardrobe are used comes only from the session
    const { user } = await requireAuth(req, deps?.authService);

    // 3. Accept exactly { itemIds, occasion, wornOn }, with today's date in some time zone
    const now = deps?.now?.() ?? new Date();
    const input = parseMarkWornPayload(await req.json().catch(() => undefined), now);
    if (!input.ok) {
      return errorResponse(input.error, 400);
    }

    // 4. Record; the service checks ownership and the combination against stored items
    const historyService = deps?.historyService || getProductionOutfitHistoryService();
    const result: MarkOutfitWornResultDto = await historyService.markWorn(user.id, input.value);
    return NextResponse.json({ success: true, data: result }, { status: result.created ? 201 : 200 });
  } catch (err) {
    return failureResponse(err, 'markWorn');
  }
}

/** GET /api/outfits/history: the signed-in user's worn outfits, newest first. */
export async function handleListOutfitHistory(req: Request, deps?: OutfitHistoryHandlerDeps): Promise<Response> {
  try {
    const { user } = await requireAuth(req, deps?.authService);
    const historyService = deps?.historyService || getProductionOutfitHistoryService();
    const data: OutfitHistoryListDto = { entries: await historyService.list(user.id) };
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return failureResponse(err, 'list');
  }
}
