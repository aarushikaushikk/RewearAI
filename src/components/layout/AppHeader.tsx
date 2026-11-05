'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

/**
 * Global application header with navigation and account menu.
 * Sign-out posts to /api/auth/logout and redirects to /sign-in.
 */
export function AppHeader({ user }: AppHeaderProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);

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
    setMenuOpen(false);
  }

  const displayName = user.name || user.email;

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-[#D7DED8] shadow-sm">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Wordmark */}
        <Link
          href="/"
          className="text-xl font-bold text-[#245B45] tracking-tight shrink-0 focus:outline-none focus:ring-2 focus:ring-[#245B45] rounded"
        >
          ReWear AI
        </Link>

        {/* Desktop navigation */}
        <nav aria-label="Main navigation" className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-sm text-[#58655E] hover:text-[#245B45] transition-colors focus:outline-none focus:ring-2 focus:ring-[#245B45] rounded"
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Account menu */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            className="flex items-center gap-2 text-sm text-[#202A25] hover:text-[#245B45] transition-colors focus:outline-none focus:ring-2 focus:ring-[#245B45] rounded px-2 py-1 min-h-[44px]"
          >
            <span
              aria-hidden="true"
              className="w-8 h-8 rounded-full bg-[#E8F1EB] text-[#245B45] flex items-center justify-center font-semibold text-sm"
            >
              {displayName.charAt(0).toUpperCase()}
            </span>
            <span className="hidden sm:inline max-w-[120px] truncate">{displayName}</span>
            <svg
              className={`h-4 w-4 text-[#58655E] transition-transform ${menuOpen ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-1 w-48 bg-white rounded-xl border border-[#D7DED8] shadow-lg py-1 z-40"
            >
              <div className="px-4 py-2 text-xs text-[#58655E] border-b border-[#D7DED8] truncate">
                {user.email}
              </div>
              <button
                role="menuitem"
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="w-full text-left px-4 py-2 text-sm text-[#A12828] hover:bg-[#FFF0EF] transition-colors disabled:opacity-60 min-h-[44px] flex items-center"
              >
                {signingOut ? 'Signing out…' : 'Sign Out'}
              </button>
            </div>
          )}
        </div>

        {/* Mobile menu button (hamburger) */}
        <button
          type="button"
          aria-label="Open navigation menu"
          className="md:hidden p-2 rounded text-[#202A25] hover:bg-[#F8F7F3] focus:outline-none focus:ring-2 focus:ring-[#245B45]"
          onClick={() => setMenuOpen((o) => !o)}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Mobile nav drawer */}
      {menuOpen && (
        <nav aria-label="Mobile navigation" className="md:hidden border-t border-[#D7DED8] bg-white px-4 py-3 flex flex-col gap-1">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className="text-sm text-[#202A25] hover:text-[#245B45] py-2 focus:outline-none focus:ring-2 focus:ring-[#245B45] rounded"
            >
              {label}
            </Link>
          ))}
          <div className="border-t border-[#D7DED8] mt-2 pt-2">
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="text-sm text-[#A12828] hover:underline disabled:opacity-60"
            >
              {signingOut ? 'Signing out…' : 'Sign Out'}
            </button>
          </div>
        </nav>
      )}

      {signOutFailed && (
        <div className="max-w-6xl mx-auto px-4 pb-3">
          <Alert
            variant="error"
            message="We couldn't sign you out. You are still signed in, so please try again."
            onDismiss={() => setSignOutFailed(false)}
          />
        </div>
      )}
    </header>
  );
}
