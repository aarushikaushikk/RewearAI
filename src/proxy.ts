import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';

/**
 * Pages reachable without a session cookie. Every other page matched below is
 * private by default, so a new route is protected without being listed here.
 */
const PUBLIC_PATHS = new Set(['/sign-in', '/sign-up']);

/**
 * Redirects visitors with no session cookie away from private pages.
 *
 * Cookie presence is a routing hint, not proof of authentication: the cookie
 * may be forged, expired, or revoked. Private pages must still call
 * requirePageSession() and route handlers must call requireAuth(). For the same
 * reason, a cookie never redirects a visitor away from a public page; those
 * pages validate the session themselves.
 */
export function proxy(request: NextRequest) {
  const isPublicPath = PUBLIC_PATHS.has(request.nextUrl.pathname);
  const hasSessionCookie = !!request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (isPublicPath || hasSessionCookie) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL('/sign-in', request.url));
}

export const config = {
  // Skips API routes, which answer 401 JSON through requireAuth(), and static
  // assets. Asset extensions are listed explicitly so that a dotted private URL
  // still runs through the proxy.
  matcher: [
    '/((?!api(?:/|$)|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpe?g|gif|webp|ico|txt|xml|webmanifest)$).*)',
  ],
};
