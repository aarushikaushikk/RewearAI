'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormField } from '@/components/ui/FormField';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Alert } from '@/components/ui/Alert';
import { validateRegisterInput } from '@/lib/validation/authValidation';
import {
  FormErrorNotice,
  getSignUpErrorNotice,
  NETWORK_ERROR_MESSAGE,
} from '@/components/auth/authFormErrors';

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
}

/**
 * Client-side sign-up / registration form.
 * Calls POST /api/auth/register; on success redirects to the dashboard.
 */
export function SignUpForm() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<FormErrorNotice | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    // Client-side validation (name is optional)
    const validation = validateRegisterInput({ email, password });
    if (!validation.isValid) {
      setFieldErrors(validation.errors as FieldErrors);
      return;
    }
    setFieldErrors({});

    setIsLoading(true);
    try {
      const payload: { email: string; password: string; name?: string } = {
        email,
        password,
      };
      if (name.trim()) payload.name = name.trim();

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: window.location.origin,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        router.push('/');
        return;
      }

      setFormError(await getSignUpErrorNotice(response));
    } catch {
      setFormError({ variant: 'error', message: NETWORK_ERROR_MESSAGE });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {formError && (
        <Alert
          variant={formError.variant}
          message={formError.message}
          onDismiss={() => setFormError(null)}
        />
      )}

      <FormField
        id="name"
        label="Name"
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        optional
        autoComplete="name"
        error={fieldErrors.name}
        disabled={isLoading}
        placeholder="Your name"
      />

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
        placeholder="you@example.com"
      />

      <FormField
        id="password"
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="new-password"
        error={fieldErrors.password}
        disabled={isLoading}
      />

      <PrimaryButton isLoading={isLoading}>Create Account</PrimaryButton>

      <p className="text-center text-sm text-[#58655E]">
        Already have an account?{' '}
        <Link href="/sign-in" className="text-[#245B45] font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
