import React from 'react';

/**
 * Starts Google sign-in. This must stay a plain link: the route redirects to Google and sets a
 * cookie, so it needs a full navigation, and next/link could prefetch it.
 */
export function GoogleSignInLink() {
  return (
    <div className="mt-6">
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-sm text-text-muted">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <a
        href="/api/auth/google"
        className={[
          'mt-6 flex w-full min-h-11 items-center justify-center gap-3 rounded-xl px-4 py-2',
          'bg-surface border border-text-muted font-semibold text-text',
          'hover:bg-primary-soft transition-colors duration-150',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
        ].join(' ')}
      >
        <svg aria-hidden="true" focusable="false" viewBox="0 0 48 48" className="h-5 w-5 shrink-0">
          <path
            fill="#EA4335"
            d="M24 9.5c3.5 0 6.7 1.2 9.2 3.6l6.9-6.9C35.9 2.4 30.5 0 24 0 14.6 0 6.5 5.4 2.6 13.2l8 6.2C12.4 13.7 17.7 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 2.9-2.2 5.4-4.7 7.1l7.7 6c4.5-4.2 6.8-10.3 6.8-17.6z"
          />
          <path
            fill="#FBBC05"
            d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-8-6.2C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l8-6.2z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.1 1.4-4.9 2.3-8.2 2.3-6.3 0-11.6-4.2-13.4-9.9l-8 6.2C6.5 42.6 14.6 48 24 48z"
          />
        </svg>
        Continue with Google
      </a>
    </div>
  );
}
