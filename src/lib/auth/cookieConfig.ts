import { SESSION_DURATION_MS } from '@/lib/auth/sessionConfig';

export const SESSION_COOKIE_NAME = 'rewear_session';

export interface CookieOptions {
  name: string;
  value: string;
  httpOnly: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  secure: boolean;
  path: string;
  maxAge: number;
  expires: Date;
}

export function getSessionCookieOptions(token: string, expiresAt: Date): CookieOptions {
  return {
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_DURATION_MS / 1000), // in seconds
    expires: expiresAt,
  };
}

export function getClearSessionCookieOptions(): CookieOptions {
  return {
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  };
}
