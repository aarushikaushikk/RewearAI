import React from 'react';
import type { Metadata } from 'next';
import { isGoogleSignInAvailable } from '@/lib/auth/googleSettings';
import { redirectIfAuthenticated } from '@/lib/auth/pageSession';
import { Alert } from '@/components/ui/Alert';
import { GoogleSignInLink } from '@/components/auth/GoogleSignInLink';
import { SignUpForm } from '@/components/auth/SignUpForm';

export const metadata: Metadata = {
  title: 'Create Account — ReWear AI',
};

// Depends on the request's session cookie, so it cannot be prerendered.
export const instant = false;

export default async function SignUpPage() {
  const { serviceUnavailable } = await redirectIfAuthenticated();

  return (
    <div className="w-full max-w-md">
      {/* Logo / wordmark */}
      <div className="mb-8 text-center">
        <p className="text-2xl font-bold text-primary tracking-tight">ReWear AI</p>
        <p className="mt-1 text-sm text-text-muted">Your intelligent digital wardrobe</p>
      </div>

      <div className="bg-surface rounded-xl shadow-sm border border-border px-6 sm:px-8 py-8 sm:py-10">
        <h1 className="mb-6 text-[1.625rem] md:text-3xl font-bold text-text">Create your account</h1>
        {serviceUnavailable && (
          <div className="mb-5">
            <Alert
              variant="error"
              message="Account creation is temporarily unavailable. Please try again later."
            />
          </div>
        )}
        <SignUpForm />
        {!serviceUnavailable && isGoogleSignInAvailable() && <GoogleSignInLink />}
      </div>
    </div>
  );
}
