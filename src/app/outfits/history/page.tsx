import React from 'react';
import type { Metadata } from 'next';
import { requirePageSession } from '@/lib/auth/pageSession';
import { AppHeader } from '@/components/layout/AppHeader';
import { OutfitHistoryList } from '@/components/outfits/OutfitHistoryList';

export const metadata: Metadata = {
  title: 'Outfit History — ReWear AI',
};

// Depends on the request's session cookie, so it cannot be prerendered.
export const instant = false;

/** Outfit History (DESIGN §5.8, wireframe 11), US10. */
export default async function OutfitHistoryPage() {
  const auth = await requirePageSession();

  return (
    <>
      <AppHeader user={auth.user} />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-6xl w-full mx-auto px-4 py-10">
        <div className="mb-6">
          <h1 className="text-[1.75rem] md:text-3xl font-bold text-text">Outfit History</h1>
          <p className="mt-1 text-text-muted">Outfits you&apos;ve marked as worn, most recent first.</p>
        </div>
        <OutfitHistoryList />
      </main>
    </>
  );
}
