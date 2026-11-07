import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { requirePageSession } from '@/lib/auth/pageSession';
import { AppHeader } from '@/components/layout/AppHeader';

export const metadata: Metadata = {
  title: 'Home — ReWear AI',
};

// Depends on the request's session cookie, so it cannot be prerendered.
export const instant = false;

export default async function HomePage() {
  const auth = await requirePageSession();

  const displayName = auth.user.name || auth.user.email;

  return (
    <>
      <AppHeader user={auth.user} />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-6xl w-full mx-auto px-4 py-10">
        {/* Greeting */}
        <section className="mb-10">
          <h1 className="text-[1.75rem] md:text-3xl font-bold text-text break-words">
            Welcome back, {displayName}!
          </h1>
          <p className="mt-1 text-text-muted">What would you like to do today?</p>
        </section>

        {/* Primary action cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          <Link
            href="/wardrobe/new"
            className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-6 hover:border-primary hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <span className="text-3xl" aria-hidden="true">👕</span>
            <h2 className="text-base font-semibold text-text">Add Clothing</h2>
            <p className="text-sm text-text-muted">Upload a new item to your wardrobe.</p>
          </Link>

          <Link
            href="/outfits/create"
            className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-6 hover:border-primary hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <span className="text-3xl" aria-hidden="true">✨</span>
            <h2 className="text-base font-semibold text-text">Create Outfit</h2>
            <p className="text-sm text-text-muted">Get outfit suggestions for an occasion.</p>
          </Link>
        </section>

        {/* Quick links */}
        <section>
          <h2 className="text-xl font-bold text-text mb-3">
            Quick Links
          </h2>
          <ul className="flex flex-col sm:flex-row gap-3">
            {[
              { href: '/wardrobe', label: 'My Wardrobe' },
              { href: '/outfits/saved', label: 'Saved Outfits' },
              { href: '/outfits/history', label: 'Outfit History' },
            ].map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-primary rounded"
                >
                  {label} →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
