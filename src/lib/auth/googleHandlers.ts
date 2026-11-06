import 'server-only';
import { getSessionCookieOptions } from '@/lib/auth/cookieConfig';
import { getGoogleSignInService } from '@/lib/auth/getGoogleSignInService';
import {
  createGoogleAuthorization,
  getGoogleSettings,
  verifyGoogleCallback,
  type GoogleSettings,
} from '@/lib/auth/googleOidc';
import {
  openTransaction,
  sealTransaction,
  TRANSACTION_LIFETIME_MS,
  type GoogleTransaction,
} from '@/lib/auth/googleTransaction';
import { serializeCookie } from '@/lib/auth/routeUtils';
import { RepositoryUnavailableError } from '@/lib/repositories/repositoryErrors';
import type { GoogleSignInRefusal, GoogleSignInService } from '@/services/googleSignInService';

const HOME_PATH = '/';
const FAILED = '/sign-in?reason=google-failed';
const UNAVAILABLE = '/sign-in?reason=google-unavailable';
const CANCELLED = '/sign-in?reason=google-cancelled';

const REFUSAL_PATHS: Record<GoogleSignInRefusal, string> = {
  'invalid-identity': FAILED,
  'email-not-verified': '/sign-in?reason=google-email-unverified',
  'email-in-use': '/sign-in?reason=google-email-in-use',
};

type LogStage = 'configuration' | 'transaction' | 'authorization' | 'verification' | 'account';
type LogCategory = 'missing' | 'rejected' | 'outage' | 'failed';

/** Logs fixed values only: codes, tokens, secrets, emails, and identities must never appear. */
function logFailure(stage: LogStage, category: LogCategory): void {
  console.error('[google-sign-in] failed', { stage, category });
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * `__Host-` makes the browser refuse a version set by a subdomain or over HTTP, which could
 * otherwise plant an attacker's transaction. It requires Secure and a path of `/`.
 */
function transactionCookieName(): string {
  return isProduction() ? '__Host-rewear_google_tx' : 'rewear_google_tx';
}

function transactionCookie(value: string, maxAgeSeconds: number, expires: Date): string {
  return serializeCookie({
    name: transactionCookieName(),
    value,
    httpOnly: true,
    // Lax, because the return from Google is a cross-site navigation. Strict would drop it.
    sameSite: 'lax',
    secure: isProduction(),
    path: '/',
    maxAge: maxAgeSeconds,
    expires,
  });
}

function clearedTransactionCookie(): string {
  return transactionCookie('', 0, new Date(0));
}

function readTransactionCookie(req: Request): string | null {
  const name = `${transactionCookieName()}=`;
  const cookie = req.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(name));
  return cookie ? cookie.slice(name.length) : null;
}

/** Redirects to a fixed path, or Google's own URL. Nothing from the request chooses the target. */
function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({
    Location: location,
    'Cache-Control': 'no-store',
    // The callback URL holds an authorization code, which must not leak through a Referer header.
    'Referrer-Policy': 'no-referrer',
  });
  for (const cookie of cookies) {
    headers.append('Set-Cookie', cookie);
  }
  return new Response(null, { status: 303, headers });
}

/** True for a timeout, failed connection, or a server error from Google. */
function isProviderOutage(err: unknown): boolean {
  let current = err;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const { name, message, status, cause } = current as {
      name?: unknown;
      message?: unknown;
      status?: unknown;
      cause?: unknown;
    };
    if (
      name === 'TimeoutError' ||
      name === 'AbortError' ||
      (name === 'TypeError' && message === 'fetch failed') ||
      (typeof status === 'number' && status >= 500)
    ) {
      return true;
    }
    current = cause;
  }
  return false;
}

function resolveSettingsAndService(): { settings: GoogleSettings; service: GoogleSignInService } | null {
  const settings = getGoogleSettings();
  if (!settings) {
    return null;
  }
  try {
    return { settings, service: getGoogleSignInService() };
  } catch {
    return null;
  }
}

export async function handleGoogleStart(): Promise<Response> {
  const resolved = resolveSettingsAndService();
  if (!resolved) {
    logFailure('configuration', 'missing');
    return redirect(UNAVAILABLE);
  }
  const { settings } = resolved;

  try {
    const { url, transaction } = await createGoogleAuthorization(settings);
    const now = Date.now();
    const sealed = sealTransaction(transaction, settings.clientSecret, now);
    return redirect(url.toString(), [
      transactionCookie(
        sealed,
        TRANSACTION_LIFETIME_MS / 1000,
        new Date(now + TRANSACTION_LIFETIME_MS),
      ),
    ]);
  } catch (err) {
    logFailure('authorization', isProviderOutage(err) ? 'outage' : 'failed');
    return redirect(UNAVAILABLE);
  }
}

export async function handleGoogleCallback(req: Request): Promise<Response> {
  const cleared = clearedTransactionCookie();

  const resolved = resolveSettingsAndService();
  if (!resolved) {
    logFailure('configuration', 'missing');
    return redirect(UNAVAILABLE, [cleared]);
  }
  const { settings, service } = resolved;

  const { search, searchParams } = new URL(req.url);
  const sealed = readTransactionCookie(req);
  const transaction: GoogleTransaction | null = sealed
    ? openTransaction(sealed, settings.clientSecret, Date.now())
    : null;

  // Binds the response to this browser, which is what stops login CSRF. Checked here as well
  // as by the library so that a forged callback never causes a request to Google.
  if (!transaction || searchParams.get('state') !== transaction.state) {
    logFailure('transaction', 'rejected');
    return redirect(FAILED, [cleared]);
  }

  const providerError = searchParams.get('error');
  if (providerError) {
    if (providerError === 'access_denied') {
      return redirect(CANCELLED, [cleared]);
    }
    logFailure('authorization', 'rejected');
    return redirect(FAILED, [cleared]);
  }
  if (!searchParams.get('code')) {
    logFailure('transaction', 'rejected');
    return redirect(FAILED, [cleared]);
  }

  let claims;
  try {
    claims = await verifyGoogleCallback(settings, search, transaction);
  } catch (err) {
    if (isProviderOutage(err)) {
      logFailure('verification', 'outage');
      return redirect(UNAVAILABLE, [cleared]);
    }
    logFailure('verification', 'rejected');
    return redirect(FAILED, [cleared]);
  }

  try {
    const result = await service.signIn(claims);
    if (result.status === 'refused') {
      return redirect(REFUSAL_PATHS[result.reason], [cleared]);
    }
    return redirect(HOME_PATH, [
      serializeCookie(getSessionCookieOptions(result.sessionToken, result.expiresAt)),
      cleared,
    ]);
  } catch (err) {
    if (err instanceof RepositoryUnavailableError) {
      logFailure('account', 'outage');
      return redirect(UNAVAILABLE, [cleared]);
    }
    logFailure('account', 'failed');
    return redirect(FAILED, [cleared]);
  }
}
