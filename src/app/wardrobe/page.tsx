import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { requirePageSession } from '@/lib/auth/pageSession';
import { AppHeader } from '@/components/layout/AppHeader';
import { WardrobeGrid, WardrobeNotice } from '@/components/wardrobe/WardrobeGrid';

export const metadata: Metadata = {
  title: 'My Wardrobe — ReWear AI',
};

// Depends on the request's session cookie, so it cannot be prerendered.
export const instant = false;

interface WardrobePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** My Wardrobe (DESIGN §5.3, wireframe 03): the saved items, newest first (US4). */
export default async function WardrobePage({ searchParams }: WardrobePageProps) {
  const auth = await requirePageSession();
  // Only a known notice is shown; any other query value is ignored.
  const notice: WardrobeNotice | undefined = (await searchParams).deleted === '1' ? 'deleted' : undefined;

  return (
    <>
      <AppHeader user={auth.user} />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-6xl w-full mx-auto px-4 py-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[1.75rem] md:text-4xl font-bold text-text">My Wardrobe</h1>
            <p className="mt-2 text-lg text-text-muted">Find and manage clothes you already own.</p>
          </div>
          <Link
            href="/wardrobe/new"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-primary px-5 text-base font-semibold text-white hover:bg-primary-hover transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            + Add Clothing
          </Link>
        </div>

        <WardrobeGrid notice={notice} />
      </main>
    </>
  );
}
