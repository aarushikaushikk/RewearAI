// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { proxy, config } from '@/proxy';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookieConfig';

const ORIGIN = 'http://localhost:3000';

function makeRequest(pathname: string, cookie?: string): NextRequest {
  return new NextRequest(`${ORIGIN}${pathname}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

function withCookie(pathname: string): NextRequest {
  return makeRequest(pathname, `${SESSION_COOKIE_NAME}=not-necessarily-valid`);
}

function expectRedirect(response: Response, destination: string) {
  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toBe(`${ORIGIN}${destination}`);
}

function expectPassThrough(response: Response) {
  // NextResponse.next() marks the response so Next.js continues routing.
  expect(response.headers.get('x-middleware-next')).toBe('1');
  expect(response.headers.get('location')).toBeNull();
}

describe('proxy', () => {
  describe('default-deny for private pages without a session cookie', () => {
    it.each(['/', '/home', '/wardrobe', '/wardrobe/new', '/outfits/create', '/settings', '/not-yet-built'])(
      'redirects %s to /sign-in, including routes nobody has listed',
      (pathname) => {
        expectRedirect(proxy(makeRequest(pathname)), '/sign-in');
      },
    );

    it('treats an empty session cookie as no session', () => {
      expectRedirect(proxy(makeRequest('/', `${SESSION_COOKIE_NAME}=`)), '/sign-in');
    });

    it('ignores cookies with other names', () => {
      expectRedirect(proxy(makeRequest('/', 'unrelated=abc123')), '/sign-in');
    });

    it.each(['/sign-in-extra', '/sign-up/nested'])(
      'does not treat %s as a public authentication page',
      (pathname) => {
        expectRedirect(proxy(makeRequest(pathname)), '/sign-in');
      },
    );
  });

  describe('private pages with a session cookie', () => {
    it.each(['/', '/home', '/wardrobe', '/settings'])(
      'passes %s through to server-side validation',
      (pathname) => {
        expectPassThrough(proxy(withCookie(pathname)));
      },
    );
  });

  describe('public authentication pages', () => {
    it.each(['/sign-in', '/sign-up'])('lets a visitor without a cookie reach %s', (pathname) => {
      expectPassThrough(proxy(makeRequest(pathname)));
    });

    // Regression: redirecting here on cookie presence alone looped forever with
    // stale cookies, because the page sends invalid sessions back to /sign-in.
    it.each(['/sign-in', '/sign-up'])(
      'does not treat cookie presence as authentication on %s',
      (pathname) => {
        expectPassThrough(proxy(withCookie(pathname)));
      },
    );

    it('keeps the session-ended notice query reachable with a stale cookie', () => {
      expectPassThrough(proxy(withCookie('/sign-in?reason=session-ended')));
    });
  });

  describe('matcher', () => {
    function runsFor(url: string): boolean {
      return unstable_doesMiddlewareMatch({ config, url });
    }

    it.each(['/', '/home', '/sign-in', '/sign-up', '/wardrobe', '/outfits/saved', '/settings/profile'])(
      'runs on page route %s',
      (url) => {
        expect(runsFor(url)).toBe(true);
      },
    );

    it.each(['/api/auth/login', '/api/wardrobe', '/api'])(
      'skips API route %s so it can answer 401 JSON instead of a redirect',
      (url) => {
        expect(runsFor(url)).toBe(false);
      },
    );

    it.each(['/_next/static/chunks/app.js', '/_next/image', '/favicon.ico', '/next.svg'])(
      'skips static asset %s',
      (url) => {
        expect(runsFor(url)).toBe(false);
      },
    );

    it.each(['/apifoo', '/wardrobe/shirt.v2', '/wardrobe/report.json'])(
      'still runs on private-looking route %s',
      (url) => {
        expect(runsFor(url)).toBe(true);
      },
    );
  });
});
