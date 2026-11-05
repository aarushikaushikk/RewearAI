import { NextResponse } from 'next/server';
import { AuthService, AuthError } from '@/services/authService';
import { getProductionAuthService, ConfigurationError } from '@/lib/auth/getAuthService';
import { validateCsrfOrigin } from '@/lib/auth/csrf';
import { IRateLimiter } from '@/lib/auth/rateLimiter';
import { defaultRateLimiter, serializeCookie, getClientKey } from '@/lib/auth/routeUtils';
import { getSessionCookieOptions, getClearSessionCookieOptions } from '@/lib/auth/cookieConfig';
import { extractTokenFromCookieHeader } from '@/lib/auth/sessionHelper';
import { normalizeEmail } from '@/lib/validation/authValidation';
import { RegisterInput, LoginInput } from '@/types/auth';

const GENERIC_503_ERROR = 'Authentication service is temporarily unavailable. Please try again later.';

export async function handleRegister(
  req: Request,
  deps?: { authService?: AuthService; rateLimiter?: IRateLimiter }
): Promise<Response> {
  // 1. Strict CSRF Protection
  if (!validateCsrfOrigin(req)) {
    return NextResponse.json(
      { success: false, error: 'CSRF validation failed: origin mismatch or missing security headers' },
      { status: 403 }
    );
  }

  // 2. IP Rate Limiting
  const rateLimiter = deps?.rateLimiter || defaultRateLimiter;
  const ipKey = getClientKey(req, 'register:ip');
  const ipStatus = await rateLimiter.check(ipKey);
  if (!ipStatus.isAllowed) {
    return NextResponse.json(
      { success: false, error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(ipStatus.retryAfterSeconds || 60),
        },
      }
    );
  }

  // 3. Resolve Service (fails closed if production DB is unconfigured)
  let authService: AuthService;
  try {
    authService = deps?.authService || getProductionAuthService();
  } catch (err) {
    if (err instanceof ConfigurationError) {
      return NextResponse.json(
        { success: false, error: GENERIC_503_ERROR },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }

  // 4. Parse payload
  let body: RegisterInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON request payload' },
      { status: 400 }
    );
  }

  // 5. Email Rate Limiting (anti-spam / registration abuse)
  const normalizedEmail = body.email ? normalizeEmail(body.email) : '';
  const emailKey = normalizedEmail ? `register:email:${normalizedEmail}` : '';
  if (emailKey) {
    const emailStatus = await rateLimiter.check(emailKey);
    if (!emailStatus.isAllowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(emailStatus.retryAfterSeconds || 60),
          },
        }
      );
    }
  }

  // 6. Perform registration
  try {
    const result = await authService.register(body);

    const cookieOptions = getSessionCookieOptions(result.sessionToken, result.expiresAt);
    const cookieHeader = serializeCookie(cookieOptions);

    const headers = new Headers();
    headers.set('Set-Cookie', cookieHeader);
    headers.set('Content-Type', 'application/json');

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          user: result.user,
        },
      }),
      {
        status: 201,
        headers,
      }
    );
  } catch (err) {
    await rateLimiter.recordAttempt(ipKey);
    if (emailKey) {
      await rateLimiter.recordAttempt(emailKey);
    }

    if (err instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode }
      );
    }

    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred during registration' },
      { status: 500 }
    );
  }
}

export async function handleLogin(
  req: Request,
  deps?: { authService?: AuthService; rateLimiter?: IRateLimiter }
): Promise<Response> {
  // 1. Strict CSRF Protection
  if (!validateCsrfOrigin(req)) {
    return NextResponse.json(
      { success: false, error: 'CSRF validation failed: origin mismatch or missing security headers' },
      { status: 403 }
    );
  }

  // 2. IP Rate Limiting
  const rateLimiter = deps?.rateLimiter || defaultRateLimiter;
  const ipKey = getClientKey(req, 'login:ip');
  const ipStatus = await rateLimiter.check(ipKey);
  if (!ipStatus.isAllowed) {
    return NextResponse.json(
      { success: false, error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(ipStatus.retryAfterSeconds || 60),
        },
      }
    );
  }

  // 3. Resolve Service (fails closed if production DB is unconfigured)
  let authService: AuthService;
  try {
    authService = deps?.authService || getProductionAuthService();
  } catch (err) {
    if (err instanceof ConfigurationError) {
      return NextResponse.json(
        { success: false, error: GENERIC_503_ERROR },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }

  // 4. Parse payload
  let body: LoginInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON request payload' },
      { status: 400 }
    );
  }

  // 5. Account/Email Rate Limiting (prevents distributed password brute-force against a single account)
  const normalizedEmail = body.email ? normalizeEmail(body.email) : '';
  const emailKey = normalizedEmail ? `login:email:${normalizedEmail}` : '';
  if (emailKey) {
    const emailStatus = await rateLimiter.check(emailKey);
    if (!emailStatus.isAllowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests for this account. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(emailStatus.retryAfterSeconds || 60),
          },
        }
      );
    }
  }

  // 6. Perform authentication
  try {
    const result = await authService.login(body);

    // Reset rate limit counters on successful authentication
    await rateLimiter.reset(ipKey);
    if (emailKey) {
      await rateLimiter.reset(emailKey);
    }

    const cookieOptions = getSessionCookieOptions(result.sessionToken, result.expiresAt);
    const cookieHeader = serializeCookie(cookieOptions);

    const headers = new Headers();
    headers.set('Set-Cookie', cookieHeader);
    headers.set('Content-Type', 'application/json');

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          user: result.user,
        },
      }),
      {
        status: 200,
        headers,
      }
    );
  } catch (err) {
    await rateLimiter.recordAttempt(ipKey);
    if (emailKey) {
      await rateLimiter.recordAttempt(emailKey);
    }

    if (err instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode }
      );
    }

    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred during login' },
      { status: 500 }
    );
  }
}

export async function handleLogout(
  req: Request,
  deps?: { authService?: AuthService }
): Promise<Response> {
  // 1. Strict CSRF Protection
  if (!validateCsrfOrigin(req)) {
    return NextResponse.json(
      { success: false, error: 'CSRF validation failed: origin mismatch or missing security headers' },
      { status: 403 }
    );
  }

  // 2. Resolve Service
  let authService: AuthService;
  try {
    authService = deps?.authService || getProductionAuthService();
  } catch (err) {
    if (err instanceof ConfigurationError) {
      return NextResponse.json(
        { success: false, error: GENERIC_503_ERROR },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }

  // 3. Extract and revoke token in repository
  const token = extractTokenFromCookieHeader(req.headers.get('cookie'));
  if (token) {
    try {
      await authService.logout(token);
    } catch {
      // Do not silently swallow database or revocation failures and report successful logout!
      return NextResponse.json(
        { success: false, error: 'Failed to complete logout due to a server error. Please try again.' },
        { status: 500 }
      );
    }
  }

  // 4. Clear cookie with exact path, name, and security attributes
  const clearOptions = getClearSessionCookieOptions();
  const cookieHeader = serializeCookie(clearOptions);

  const headers = new Headers();
  headers.set('Set-Cookie', cookieHeader);
  headers.set('Content-Type', 'application/json');

  return new Response(
    JSON.stringify({
      success: true,
      message: 'Logged out successfully',
    }),
    {
      status: 200,
      headers,
    }
  );
}

export async function handleGetSession(
  req: Request,
  deps?: { authService?: AuthService }
): Promise<Response> {
  // 1. Resolve Service
  let authService: AuthService;
  try {
    authService = deps?.authService || getProductionAuthService();
  } catch (err) {
    if (err instanceof ConfigurationError) {
      return NextResponse.json(
        { success: false, error: GENERIC_503_ERROR },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }

  // 2. Extract token from cookie
  const token = extractTokenFromCookieHeader(req.headers.get('cookie'));
  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: no active session' },
      { status: 401 }
    );
  }

  // 3. Validate session
  let auth;
  try {
    auth = await authService.validateSession(token);
  } catch {
    return NextResponse.json(
      { success: false, error: 'Internal server error during session validation' },
      { status: 500 }
    );
  }

  if (!auth) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized: session expired or invalid' },
      { status: 401 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      user: auth.user,
    },
  });
}
