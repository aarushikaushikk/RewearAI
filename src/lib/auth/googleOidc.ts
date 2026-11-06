import 'server-only';
import * as client from 'openid-client';
import type { GoogleTransaction } from '@/lib/auth/googleTransaction';
import type { VerifiedGoogleClaims } from '@/services/googleSignInService';

// Fixed in code, with no setting to change it, so configuration can't redirect sign-in elsewhere.
const GOOGLE_ISSUER = new URL('https://accounts.google.com');
const CALLBACK_PATH = '/api/auth/google/callback';
const SCOPE = 'openid email profile';
const REQUEST_TIMEOUT_SECONDS = 10;
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

const configurations = new Map<string, Promise<client.Configuration>>();

/** Fetches Google's metadata once per client. A failed attempt is forgotten, so the next retries. */
function getConfiguration(settings: GoogleSettings): Promise<client.Configuration> {
  const key = `${settings.clientId}\n${settings.clientSecret}`;
  const existing = configurations.get(key);
  if (existing) {
    return existing;
  }

  const attempt = client.discovery(
    GOOGLE_ISSUER,
    settings.clientId,
    settings.clientSecret,
    undefined,
    {
      // The library treats ID token signature checks as optional, so they're turned on here.
      execute: [client.enableNonRepudiationChecks],
      timeout: REQUEST_TIMEOUT_SECONDS,
    },
  );
  configurations.set(key, attempt);
  attempt.catch(() => configurations.delete(key));
  return attempt;
}

export async function createGoogleAuthorization(
  settings: GoogleSettings,
): Promise<{ url: URL; transaction: GoogleTransaction }> {
  const configuration = await getConfiguration(settings);
  const transaction: GoogleTransaction = {
    state: client.randomState(),
    nonce: client.randomNonce(),
    codeVerifier: client.randomPKCECodeVerifier(),
  };

  const url = client.buildAuthorizationUrl(configuration, {
    redirect_uri: settings.redirectUri,
    response_type: 'code',
    scope: SCOPE,
    state: transaction.state,
    nonce: transaction.nonce,
    code_challenge: await client.calculatePKCECodeChallenge(transaction.codeVerifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return { url, transaction };
}

/**
 * Exchanges the code and verifies the ID token's signature, issuer, audience, expiry, and nonce,
 * along with the state and PKCE. It throws if anything fails. Only the ID token's claims leave
 * this function: Google's access and refresh tokens are discarded.
 */
export async function verifyGoogleCallback(
  settings: GoogleSettings,
  search: string,
  transaction: GoogleTransaction,
): Promise<VerifiedGoogleClaims> {
  const configuration = await getConfiguration(settings);
  const tokens = await client.authorizationCodeGrant(
    configuration,
    new URL(`${settings.redirectUri}${search}`),
    {
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
      pkceCodeVerifier: transaction.codeVerifier,
      idTokenExpected: true,
    },
  );

  const claims = tokens.claims();
  if (!claims) {
    throw new Error('The token response had no ID token');
  }
  return {
    sub: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : '',
    emailVerified: claims.email_verified === true,
    name: typeof claims.name === 'string' ? claims.name : null,
  };
}
