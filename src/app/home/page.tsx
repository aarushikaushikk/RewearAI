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

const DESTINATIONS = [
  { href: '/wardrobe', title: 'My Wardrobe', description: 'View and organize saved clothing' },
  { href: '/outfits/create', title: 'Create Outfit', description: 'Choose an occasion' },
  { href: '/outfits/saved', title: 'Saved Outfits', description: 'Revisit combinations' },
];

const OPEN_LINK_BASE =
  'inline-flex min-h-11 w-full sm:w-40 items-center justify-center rounded-xl px-4 py-2 text-base font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2';

/**
 * Signed-in Home, laid out after docs/Wireframes.pdf page 3, "02 Home /
 * navigation hub": greeting, three entry-point cards and a soft-green panel.
 */
export default async function HomePage() {
  const auth = await requirePageSession();

  const displayName = auth.user.name || auth.user.email;

  return (
    <>
      <AppHeader user={auth.user} />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-6xl w-full mx-auto px-4 py-10">
        <section className="mb-10">
          <h1 className="text-[1.75rem] md:text-4xl font-bold text-text break-words">
            Welcome back, {displayName}
          </h1>
          <p className="mt-2 text-lg text-text-muted">Your wardrobe, your outfits, all in one place.</p>
        </section>

        <ul className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {DESTINATIONS.map(({ href, title, description }, index) => (
            <li
              key={href}
              className="flex flex-col rounded-xl border border-border bg-surface p-6"
            >
              <h2 className="text-xl font-semibold text-text">{title}</h2>
              <p className="mt-4 mb-6 text-base text-text-muted">{description}</p>
              {/* The first card is the primary action; the others are secondary. */}
              <Link
                href={href}
                aria-label={`Open ${title}`}
                className={[
                  OPEN_LINK_BASE,
                  'mt-auto',
                  index === 0
                    ? 'bg-primary text-white hover:bg-primary-hover'
                    : 'border border-border bg-surface text-primary hover:border-primary',
                ].join(' ')}
              >
                Open
              </Link>
            </li>
          ))}
        </ul>

        <section
          aria-labelledby="add-clothing-heading"
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl bg-primary-soft px-6 py-5"
        >
          <div>
            <h2 id="add-clothing-heading" className="text-lg font-semibold text-primary">
              Build your wardrobe
            </h2>
            <p className="mt-1 text-base text-text-muted">
              Upload a photo of a clothing item you own to add it to My Wardrobe.
            </p>
          </div>
          <Link
            href="/wardrobe/new"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-primary bg-surface px-4 py-2 text-base font-semibold text-primary hover:bg-background transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Add Clothing
          </Link>
        </section>
      </main>
    </>
  );
}
