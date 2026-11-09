import React from 'react';
import type { Metadata } from 'next';
import { requirePageSession } from '@/lib/auth/pageSession';
import { AppHeader } from '@/components/layout/AppHeader';
import { ClothingDetail } from '@/components/wardrobe/ClothingDetail';

export const metadata: Metadata = {
  title: 'Clothing Details — ReWear AI',
};

// Depends on the request's session cookie, so it cannot be prerendered.
export const instant = false;

interface ClothingDetailPageProps {
  params: Promise<{ itemId: string }>;
}

/**
 * Clothing Detail / Edit (DESIGN §5.5, wireframe 04, US4). The session is checked
 * here; the item is loaded through the API, which only returns the user's own items.
 */
export default async function ClothingDetailPage({ params }: ClothingDetailPageProps) {
  const auth = await requirePageSession();
  const { itemId } = await params;

  return (
    <>
      <AppHeader user={auth.user} />

      <main id="main-content" tabIndex={-1} className="flex-1 max-w-6xl w-full mx-auto px-4 py-10">
        <ClothingDetail itemId={itemId} />
      </main>
    </>
  );
}
