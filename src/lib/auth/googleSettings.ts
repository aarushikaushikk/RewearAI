import 'server-only';

const CALLBACK_PATH = '/api/auth/google/callback';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

export interface GoogleSettings {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Returns null unless Google sign-in is fully and validly configured. The callback URL comes
 * only from APP_ORIGIN, never from a request's Host header.
 */
export function getGoogleSettings(): GoogleSettings | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const appOrigin = process.env.APP_ORIGIN?.trim();
  if (!clientId || !clientSecret || !appOrigin) {
    return null;
  }

  let origin: URL;
  try {
    origin = new URL(appOrigin);
  } catch {
    return null;
  }
  // Anything beyond a bare origin, such as a path or credentials, fails this comparison.
  if (origin.origin !== appOrigin || !['http:', 'https:'].includes(origin.protocol)) {
    return null;
  }
  if (
    process.env.NODE_ENV === 'production' &&
    origin.protocol !== 'https:' &&
    !LOOPBACK_HOSTS.has(origin.hostname)
  ) {
    return null;
  }

  return { clientId, clientSecret, redirectUri: `${origin.origin}${CALLBACK_PATH}` };
}

/** Whether to offer Google sign-in. Reveals nothing about the settings themselves. */
export function isGoogleSignInAvailable(): boolean {
  return getGoogleSettings() !== null && Boolean(process.env.MONGODB_URI?.trim());
}
