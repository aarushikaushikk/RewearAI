import React from 'react';
import type { Metadata } from 'next';
import { requirePageSession } from '@/lib/auth/pageSession';
import { AppHeader } from '@/components/layout/AppHeader';
import { SavedOutfitList } from '@/components/outfits/SavedOutfitList';

export const metadata: Metadata = {
  title: 'Saved Outfits — ReWear AI',
};

// Depends on the request's session cookie, so it cannot be prerendered.
export const instant = false;

/** Saved Outfits (DESIGN §5, wireframe 10), US9. */
export default async function SavedOutfitsPage() {
  const auth = await requirePageSession();

  return (
    <>
      <AppHeader user={auth.user} />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-6xl w-full mx-auto px-4 py-10">
        <div className="mb-6">
          <h1 className="text-[1.75rem] md:text-3xl font-bold text-text">Saved Outfits</h1>
          <p className="mt-1 text-text-muted">Outfits you saved to wear again.</p>
        </div>
        <SavedOutfitList />
      </main>
    </>
  );
}
