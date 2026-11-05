import { AuthService, AuthError } from '@/services/authService';
import { SafeUser } from '@/types/user';
import { SessionRecord } from '@/types/session';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';
import { getProductionAuthService } from '@/lib/auth/getAuthService';
import { cookies } from 'next/headers';

export interface AuthenticatedSession {
  user: SafeUser;
  session: SessionRecord;
}

/**
 * Extracts session token from a Cookie header string.
 */
export function extractTokenFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) {
    return null;
  }
  const cookiesList = cookieHeader.split(';').map((c) => c.trim());
  for (const cookie of cookiesList) {
    const [name, ...valParts] = cookie.split('=');
    if (name.trim() === SESSION_COOKIE_NAME) {
      return valParts.join('=').trim();
    }
  }
  return null;
}

/**
 * Validates session explicitly from an incoming HTTP Request.
 * Use this in Next.js Route Handlers or middleware where `Request` is directly available.
 */
export async function getSessionFromRequest(
  request: Request,
  authService?: AuthService
): Promise<AuthenticatedSession | null> {
  const service = authService || getProductionAuthService();
  const token = extractTokenFromCookieHeader(request.headers.get('cookie'));

  if (!token) {
    return null;
  }

  return service.validateSession(token);
}

/**
 * Validates session using Next.js 16 supported server-side cookies API (next/headers).
 * Use this in React Server Components, layouts, and Server Actions.
 */
export async function getServerSession(
  authService?: AuthService
): Promise<AuthenticatedSession | null> {
  const service = authService || getProductionAuthService();

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!token) {
      return null;
    }

    return service.validateSession(token);
  } catch {
    // If called outside of a Next.js server context, fail safely
    return null;
  }
}

/**
 * Resolves current authenticated session.
 * Automatically delegates to request-based validation if a Request is passed,
 * or server-cookie validation (next/headers) if Request is omitted.
 */
export async function getCurrentSession(
  request?: Request,
  authService?: AuthService
): Promise<AuthenticatedSession | null> {
  if (request) {
    return getSessionFromRequest(request, authService);
  }
  return getServerSession(authService);
}

/**
 * Enforces authentication on server operations and Route Handlers.
 * Throws an AuthError (401 Unauthorized) if no valid session is present.
 */
export async function requireAuth(
  request?: Request,
  authService?: AuthService
): Promise<AuthenticatedSession> {
  const auth = await getCurrentSession(request, authService);
  if (!auth) {
    throw new AuthError('Authentication required', 'UNAUTHORIZED', 401);
  }
  return auth;
}
