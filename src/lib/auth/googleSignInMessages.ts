import type { AlertVariant } from '@/components/ui/Alert';

export interface GoogleSignInMessage {
  variant: AlertVariant;
  message: string;
}

// Fixed text for each reason the callback can send. Nothing from the URL is ever displayed.
const MESSAGES = new Map<string, GoogleSignInMessage>([
  [
    'google-cancelled',
    {
      variant: 'warning',
      message: 'Sign-in with Google was cancelled. You can try again or use your email and password.',
    },
  ],
  [
    'google-failed',
    {
      variant: 'error',
      message: "We couldn't complete sign-in with Google, or the attempt expired. Please try again.",
    },
  ],
  [
    'google-unavailable',
    {
      variant: 'error',
      message: 'Sign-in with Google is temporarily unavailable. Please try again later.',
    },
  ],
  [
    'google-email-in-use',
    {
      variant: 'warning',
      message:
        "This email already has an account that isn't connected to Google. Please sign in the way you did before.",
    },
  ],
  [
    'google-email-unverified',
    {
      variant: 'error',
      message: "Your Google account's email isn't verified. Please verify it with Google and try again.",
    },
  ],
]);

export function googleSignInMessage(reason: unknown): GoogleSignInMessage | null {
  return typeof reason === 'string' ? (MESSAGES.get(reason) ?? null) : null;
}
