'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormField } from '@/components/ui/FormField';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Alert } from '@/components/ui/Alert';
import { validateLoginInput } from '@/lib/validation/authValidation';
import {
  focusFirstInvalidField,
  getSignInErrorMessage,
  NETWORK_ERROR_MESSAGE,
} from '@/components/auth/authFormErrors';

interface FieldErrors {
  email?: string;
  password?: string;
}

/**
 * Client-side sign-in form.
 * Calls POST /api/auth/login; on success redirects to the dashboard.
 */
export function SignInForm() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    // Client-side validation
    const validation = validateLoginInput({ email, password });
    if (!validation.isValid) {
      setFieldErrors(validation.errors as FieldErrors);
      focusFirstInvalidField(validation.errors);
      return;
    }
    setFieldErrors({});

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: window.location.origin,
        },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        // Stays busy until the page changes, so the form cannot be sent twice.
        router.push('/');
        return;
      }

      setFormError(getSignInErrorMessage(response.status));
    } catch {
      setFormError(NETWORK_ERROR_MESSAGE);
    }
    setIsLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {formError && (
        <Alert
          variant="error"
          message={formError}
          onDismiss={() => {
            setFormError(null);
            document.getElementById('email')?.focus();
          }}
          focusOnMount
        />
      )}

      <FormField
        id="email"
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        error={fieldErrors.email}
        disabled={isLoading}
        placeholder="name@example.com"
      />

      <FormField
        id="password"
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="current-password"
        error={fieldErrors.password}
        disabled={isLoading}
      />

      <PrimaryButton isLoading={isLoading}>Sign In</PrimaryButton>

      <p className="text-center text-sm text-text-muted">
        Don&apos;t have an account?{' '}
        <Link href="/sign-up" className="inline-flex min-h-11 items-center text-primary font-medium hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
