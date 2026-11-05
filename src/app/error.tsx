'use client';

import React from 'react';
import Link from 'next/link';
import { PrimaryButton } from '@/components/ui/PrimaryButton';

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  retry: () => void;
}

/**
 * Shown when a page fails to render, including when a session cannot be checked
 * during an outage. The error itself is never displayed, since it may hold
 * internal details; the server logs it. The copy does not claim the user is
 * signed out, because an outage says nothing about their session.
 */
export default function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F8F7F3] px-4 py-12">
      <div
        role="alert"
        className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-[#D7DED8] px-8 py-10 flex flex-col gap-5"
      >
        <div>
          <h1 className="text-lg font-semibold text-[#202A25]">We couldn&apos;t load this page</h1>
          <p className="mt-2 text-sm text-[#58655E]">
            This is usually temporary. Please try again in a moment.
          </p>
        </div>

        <PrimaryButton type="button" onClick={retry}>
          Try again
        </PrimaryButton>

        <Link
          href="/sign-in"
          className="text-center text-sm text-[#245B45] font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-[#245B45] rounded"
        >
          Go to sign in
        </Link>
      </div>
    </main>
  );
}
