import React from 'react';
import type { Metadata } from 'next';
import { requirePageSession } from '@/lib/auth/pageSession';
import { AppHeader } from '@/components/layout/AppHeader';
import { AddClothingForm } from '@/components/wardrobe/AddClothingForm';

export const metadata: Metadata = {
  title: 'Add Clothing — ReWear AI',
};

// Depends on the request's session cookie, so it cannot be prerendered.
export const instant = false;

export default async function AddClothingPage() {
  const auth = await requirePageSession();

  return (
    <>
      <AppHeader user={auth.user} />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-6xl w-full mx-auto px-4 py-10">
        <section className="mb-8">
          <h1 className="text-[1.75rem] md:text-3xl font-bold text-text">Add Clothing</h1>
          <p className="mt-1 text-text-muted">Add a photo of something you own and describe it.</p>
        </section>

        <AddClothingForm />
      </main>
    </>
  );
}
