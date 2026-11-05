import React from 'react';
import type { Metadata } from 'next';
import { redirectIfAuthenticated } from '@/lib/auth/pageSession';
import { Alert } from '@/components/ui/Alert';
import { SignUpForm } from '@/components/auth/SignUpForm';

export const metadata: Metadata = {
  title: 'Create Account — ReWear AI',
};

// Depends on the request's session cookie, so it cannot be prerendered.
export const instant = false;

export default async function SignUpPage() {
  const { serviceUnavailable } = await redirectIfAuthenticated();

  return (
    <div className="w-full max-w-sm">
      {/* Logo / wordmark */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-[#245B45] tracking-tight">ReWear AI</h1>
        <p className="mt-1 text-sm text-[#58655E]">Your intelligent digital wardrobe</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-[#D7DED8] px-8 py-10">
        <h2 className="mb-6 text-lg font-semibold text-[#202A25]">Create your account</h2>
        {serviceUnavailable && (
          <div className="mb-5">
            <Alert
              variant="error"
              message="Account creation is temporarily unavailable. Please try again later."
            />
          </div>
        )}
        <SignUpForm />
      </div>
    </div>
  );
}
