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
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md bg-surface rounded-xl shadow-sm border border-border px-6 sm:px-8 py-8 sm:py-10 flex flex-col gap-5">
        <div role="alert">
          <h1 className="text-[1.625rem] md:text-3xl font-bold text-text">We couldn&apos;t load this page</h1>
          <p className="mt-2 text-base text-text-muted">
            This is usually temporary. Please try again in a moment.
          </p>
        </div>

        <PrimaryButton type="button" onClick={retry}>
          Try again
        </PrimaryButton>

        <Link
          href="/sign-in"
          className="flex min-h-11 items-center justify-center text-sm text-primary font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-primary rounded"
        >
          Go to sign in
        </Link>
      </div>
    </main>
  );
}
