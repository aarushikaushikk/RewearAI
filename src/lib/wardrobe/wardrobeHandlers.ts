import { NextResponse } from 'next/server';
import { AuthService, AuthError } from '@/services/authService';
import { WardrobeError, WardrobeItemService } from '@/services/wardrobeItemService';
import { ConfigurationError } from '@/lib/auth/getAuthService';
import { validateCsrfOrigin } from '@/lib/auth/csrf';
import { requireAuth } from '@/lib/auth/sessionHelper';
import { RepositoryUnavailableError } from '@/lib/repositories/repositoryErrors';
import { getProductionWardrobeItemService } from '@/lib/wardrobe/getWardrobeItemService';
import { parseNewItemPayload } from '@/lib/validation/wardrobeValidation';
import { MAX_IMAGE_BYTES, MAX_IMAGE_LABEL } from '@/types/upload';

export interface WardrobeHandlerDeps {
  authService?: AuthService;
  wardrobeService?: WardrobeItemService;
}

const GENERIC_503_ERROR = 'The wardrobe service is temporarily unavailable. Please try again later.';
const INVALID_PAYLOAD_ERROR = 'Invalid request payload';

function errorResponse(error: string, status: number): Response {
  return NextResponse.json({ success: false, error }, { status });
}

function csrfFailure(): Response {
  return errorResponse('CSRF validation failed: origin mismatch or missing security headers', 403);
}

/**
 * Maps a thrown error to a safe response. Only fixed or service-chosen messages
 * are sent; anything unexpected is logged by name only.
 */
function failureResponse(err: unknown, operation: string): Response {
  if (err instanceof WardrobeError || err instanceof AuthError) {
    return errorResponse(err.message, err.statusCode);
  }
  if (err instanceof RepositoryUnavailableError || err instanceof ConfigurationError) {
    return errorResponse(GENERIC_503_ERROR, 503);
  }
  console.error('[wardrobe] request failed', {
    operation,
    category: err instanceof Error ? err.name : 'unknown',
  });
  return errorResponse('Internal server error', 500);
}

export async function handleUploadImage(
  req: Request,
  deps?: WardrobeHandlerDeps,
): Promise<Response> {
  // 1. Strict CSRF Protection
  if (!validateCsrfOrigin(req)) {
    return csrfFailure();
  }

  try {
    // 2. Authenticate; the owner always comes from the session
    const { user } = await requireAuth(req, deps?.authService);

    // 3. Read the file, refusing an oversized one before buffering it
    const form = await req.formData().catch(() => null);
    const file = form?.get('image');
    if (!(file instanceof File)) {
      return errorResponse('Choose an image to upload.', 400);
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return errorResponse(`This image is larger than ${MAX_IMAGE_LABEL}. Choose a smaller image.`, 413);
    }

    // 4. Upload
    const wardrobeService = deps?.wardrobeService || getProductionWardrobeItemService();
    const image = await wardrobeService.uploadImage(user.id, new Uint8Array(await file.arrayBuffer()));
    return NextResponse.json({ success: true, data: image }, { status: 201 });
  } catch (err) {
    return failureResponse(err, 'upload');
  }
}

export async function handleCreateItem(
  req: Request,
  deps?: WardrobeHandlerDeps,
): Promise<Response> {
  // 1. Strict CSRF Protection
  if (!validateCsrfOrigin(req)) {
    return csrfFailure();
  }

  try {
    // 2. Authenticate; any owner in the body is ignored
    const { user } = await requireAuth(req, deps?.authService);

    // 3. Reject malformed payloads, which need no service to answer
    const input = parseNewItemPayload(await req.json().catch(() => undefined));
    if (!input) {
      return errorResponse(INVALID_PAYLOAD_ERROR, 400);
    }

    // 4. Save; a retried save answers 200 with the item it already created
    const wardrobeService = deps?.wardrobeService || getProductionWardrobeItemService();
    const { item, created } = await wardrobeService.createItem(user.id, input);
    return NextResponse.json({ success: true, data: item }, { status: created ? 201 : 200 });
  } catch (err) {
    return failureResponse(err, 'create');
  }
}

/** Called by Vercel Cron (see vercel.json) with `Authorization: Bearer $CRON_SECRET`. */
export async function handleCleanupUploads(
  req: Request,
  deps?: WardrobeHandlerDeps,
): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return errorResponse('Unauthorized', 401);
  }

  try {
    const wardrobeService = deps?.wardrobeService || getProductionWardrobeItemService();
    const result = await wardrobeService.cleanupAbandonedUploads();
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    return failureResponse(err, 'cleanup');
  }
}
