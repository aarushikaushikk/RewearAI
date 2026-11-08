import { cookies } from 'next/headers';
import { redirect, unstable_rethrow } from 'next/navigation';
import { AuthService } from '@/services/authService';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';
import { AuthenticatedSession, getServerSession } from '@/lib/auth/sessionHelper';
import { HOME_PATH } from '@/lib/routes';

export const SESSION_ENDED_REASON = 'session-ended';
export const SIGN_IN_SESSION_ENDED_PATH = `/sign-in?reason=${SESSION_ENDED_REASON}`;

/**
 * Validates the session for a private page and returns it.
 *
 * Call this first in every private page, not in a layout: layouts do not re-run
 * on client navigation. Service failures propagate to the error boundary so an
 * outage is never presented to the user as being signed out.
 */
export async function requirePageSession(
  authService?: AuthService
): Promise<AuthenticatedSession> {
  const cookieStore = await cookies();
  const hadSessionCookie = !!cookieStore.get(SESSION_COOKIE_NAME)?.value;

  const auth = await getServerSession(authService);
  if (auth) {
    return auth;
  }

  redirect(hadSessionCookie ? SIGN_IN_SESSION_ENDED_PATH : '/sign-in');
}

export interface PublicAuthPageState {
  serviceUnavailable: boolean;
}

/**
 * Sends a validly signed-in visitor from a public authentication page to Home.
 *
 * Anyone else stays on the page. That includes a visitor whose cookie cannot be
 * checked during an outage, so the sign-in page is always reachable; submitting
 * the form still fails closed in the API.
 */
export async function redirectIfAuthenticated(
  authService?: AuthService
): Promise<PublicAuthPageState> {
  let auth: AuthenticatedSession | null;
  try {
    auth = await getServerSession(authService);
  } catch (err) {
    unstable_rethrow(err);
    return { serviceUnavailable: true };
  }

  if (auth) {
    redirect(HOME_PATH);
  }

  return { serviceUnavailable: false };
}
