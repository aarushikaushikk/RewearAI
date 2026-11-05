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
    <div className="w-full max-w-sm">
      {/* Logo / wordmark */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-[#245B45] tracking-tight">ReWear AI</h1>
        <p className="mt-1 text-sm text-[#58655E]">Your intelligent digital wardrobe</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-[#D7DED8] px-8 py-10">
        <h2 className="mb-6 text-lg font-semibold text-[#202A25]">Sign in to your account</h2>
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
