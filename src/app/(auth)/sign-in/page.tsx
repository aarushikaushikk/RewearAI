import React from 'react';
import type { Metadata } from 'next';
import { redirectIfAuthenticated, SESSION_ENDED_REASON } from '@/lib/auth/pageSession';
import { Alert } from '@/components/ui/Alert';
import { SignInForm } from '@/components/auth/SignInForm';

export const metadata: Metadata = {
  title: 'Sign In — ReWear AI',
};

// Depends on the request's session cookie, so it cannot be prerendered.
export const instant = false;

interface SignInPageProps {
  searchParams: Promise<{ reason?: string | string[] }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { serviceUnavailable } = await redirectIfAuthenticated();
  const { reason } = await searchParams;

  return (
    <div className="w-full max-w-md">
      {/* Logo / wordmark */}
      <div className="mb-8 text-center">
        <p className="text-2xl font-bold text-primary tracking-tight">ReWear AI</p>
        <p className="mt-1 text-sm text-text-muted">Your intelligent digital wardrobe</p>
      </div>

      <div className="bg-surface rounded-xl shadow-sm border border-border px-6 sm:px-8 py-8 sm:py-10">
        <h1 className="mb-6 text-[1.625rem] md:text-3xl font-bold text-text">Sign in to your account</h1>
        {serviceUnavailable ? (
          <div className="mb-5">
            <Alert
              variant="error"
              message="Sign-in is temporarily unavailable. Please try again later."
            />
          </div>
        ) : (
          reason === SESSION_ENDED_REASON && (
            <div className="mb-5">
              <Alert variant="warning" message="Your session has ended. Please sign in again." />
            </div>
          )
        )}
        <SignInForm />
      </div>
    </div>
  );
}
