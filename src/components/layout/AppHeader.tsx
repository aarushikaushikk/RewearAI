'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/Alert';
import type { SafeUser } from '@/types/user';

interface AppHeaderProps {
  user: SafeUser;
}

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/wardrobe', label: 'My Wardrobe' },
  { href: '/outfits/create', label: 'Create Outfit' },
  { href: '/outfits/saved', label: 'Saved Outfits' },
  { href: '/outfits/history', label: 'Outfit History' },
];

function isCurrentPage(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Global application header. Wide screens show the navigation links and an
 * account menu; narrower screens collect both behind a labeled Menu button.
 * Pages using this header must give their <main> the id "main-content".
 */
export function AppHeader({ user }: AppHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [accountOpen, setAccountOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

  const accountRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const navButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!accountOpen && !navOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }
      (accountOpen ? accountButtonRef : navButtonRef).current?.focus();
      setAccountOpen(false);
      setNavOpen(false);
    }

    function handlePointerDown(event: PointerEvent) {
      if (!accountRef.current?.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [accountOpen, navOpen]);

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutFailed(false);

    let succeeded = false;
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Origin: window.location.origin },
      });
      succeeded = response.ok;
    } catch {
      succeeded = false;
    }

    if (succeeded) {
      // refresh() drops cached private pages so Back cannot show them again.
      router.replace('/sign-in');
      router.refresh();
      return;
    }

    // The session may still be valid on the server, so stay signed in visibly.
    setSigningOut(false);
    setSignOutFailed(true);
    setAccountOpen(false);
    setNavOpen(false);
  }

  const displayName = user.name || user.email;

  const signOutButton = (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={signingOut}
      className="w-full text-left px-4 min-h-11 text-sm text-danger hover:bg-danger-soft transition-colors disabled:opacity-60 flex items-center rounded-xl"
    >
      {signingOut ? 'Signing out…' : 'Sign Out'}
    </button>
  );

  return (
    <header className="sticky top-0 z-30 bg-surface border-b border-border shadow-sm">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-xl focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:text-primary"
      >
        Skip to main content
      </a>

      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Wordmark */}
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-xl font-bold text-primary tracking-tight shrink-0 focus:outline-none focus:ring-2 focus:ring-primary rounded"
        >
          ReWear AI
        </Link>

        {/* Wide-screen navigation */}
        <nav aria-label="Main navigation" className="hidden lg:flex items-center gap-6">
          {NAV_LINKS.map(({ href, label }) => {
            const current = isCurrentPage(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={current ? 'page' : undefined}
                className={[
                  'inline-flex min-h-11 items-center whitespace-nowrap text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary rounded',
                  current
                    ? 'font-semibold text-primary underline underline-offset-4'
                    : 'text-text-muted hover:text-primary',
                ].join(' ')}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Wide-screen account menu */}
        <div
          ref={accountRef}
          className="relative shrink-0 hidden lg:block"
          onBlur={(event) => {
            if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
              setAccountOpen(false);
            }
          }}
        >
          <button
            ref={accountButtonRef}
            type="button"
            onClick={() => setAccountOpen((open) => !open)}
            aria-expanded={accountOpen}
            aria-label={`Account menu for ${displayName}`}
            className="flex items-center gap-2 text-sm text-text hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary rounded px-2 py-1 min-h-11"
          >
            <span
              aria-hidden="true"
              className="w-8 h-8 rounded-full bg-primary-soft text-primary flex items-center justify-center font-semibold text-sm"
            >
              {displayName.charAt(0).toUpperCase()}
            </span>
            <span className="max-w-[120px] truncate">{displayName}</span>
            <svg
              className={`h-4 w-4 text-text-muted transition-transform ${accountOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {accountOpen && (
            <div className="absolute right-0 mt-1 w-56 bg-surface rounded-xl border border-border shadow-lg py-1 z-40">
              <p className="px-4 py-2 text-sm text-text-muted border-b border-border truncate">
                {user.email}
              </p>
              {signOutButton}
            </div>
          )}
        </div>

        {/* Narrow-screen menu button */}
        <button
          ref={navButtonRef}
          type="button"
          onClick={() => setNavOpen((open) => !open)}
          aria-expanded={navOpen}
          aria-controls="mobile-navigation"
          className="lg:hidden inline-flex min-h-11 min-w-11 items-center justify-center gap-2 px-2 rounded text-sm font-medium text-text hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          Menu
        </button>
      </div>

      {/* Narrow-screen navigation drawer */}
      {navOpen && (
        <nav
          id="mobile-navigation"
          aria-label="Mobile navigation"
          className="lg:hidden border-t border-border bg-surface px-4 py-3 flex flex-col gap-1"
        >
          {NAV_LINKS.map(({ href, label }) => {
            const current = isCurrentPage(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={current ? 'page' : undefined}
                onClick={() => setNavOpen(false)}
                className={[
                  'flex min-h-11 items-center text-base hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary rounded',
                  current ? 'font-semibold text-primary underline underline-offset-4' : 'text-text',
                ].join(' ')}
              >
                {label}
              </Link>
            );
          })}
          <div className="-mx-4 border-t border-border mt-2 pt-2">
            <p className="px-4 py-2 text-sm text-text-muted truncate">{user.email}</p>
            {signOutButton}
          </div>
        </nav>
      )}

      {signOutFailed && (
        <div className="max-w-6xl mx-auto px-4 pb-3">
          <Alert
            variant="error"
            message="We couldn't sign you out. You are still signed in, so please try again."
            onDismiss={() => setSignOutFailed(false)}
            focusOnMount
          />
        </div>
      )}
    </header>
  );
}
