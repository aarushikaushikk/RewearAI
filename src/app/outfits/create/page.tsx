import React from 'react';
import type { Metadata } from 'next';
import { requirePageSession } from '@/lib/auth/pageSession';
import { AppHeader } from '@/components/layout/AppHeader';
import { CreateOutfitForm } from '@/components/outfits/CreateOutfitForm';

export const metadata: Metadata = {
  title: 'Create Outfit — ReWear AI',
};

// Depends on the request's session cookie, so it cannot be prerendered.
export const instant = false;

/** Create Outfit (DESIGN §5.6, wireframe 08), US7. */
export default async function CreateOutfitPage() {
  const auth = await requirePageSession();

  return (
    <>
      <AppHeader user={auth.user} />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-6xl w-full mx-auto px-4 py-10">
        <div className="mb-6">
          <h1 className="text-[1.75rem] md:text-3xl font-bold text-text">Create Outfit</h1>
          <p className="mt-1 text-text-muted">
            Choose an occasion to get an outfit made only from your own available clothing.
          </p>
        </div>
        <CreateOutfitForm />
      </main>
    </>
  );
}
