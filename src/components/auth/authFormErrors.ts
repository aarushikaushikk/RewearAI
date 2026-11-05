import type { AlertVariant } from '@/components/ui/Alert';

export interface FormErrorNotice {
  variant: AlertVariant;
  message: string;
}

export const NETWORK_ERROR_MESSAGE =
  "We couldn't reach the server. Check your connection and try again.";

const UNEXPECTED_ERROR_MESSAGE = 'An unexpected error occurred. Please try again.';

// Messages are chosen here rather than shown from the response, so server text
// can never reach the user.
const SHARED_STATUS_MESSAGES: Record<number, string> = {
  403: "We couldn't verify this request. Refresh the page and try again.",
  429: 'Too many attempts. Please wait and try again.',
  500: 'Something went wrong on our end. Please try again.',
  503: 'Service temporarily unavailable. Please try again later.',
};

const SIGN_IN_STATUS_MESSAGES: Record<number, string> = {
  ...SHARED_STATUS_MESSAGES,
  // Identical for both so that responses never reveal whether an account exists.
  400: 'Sign-in failed. Check your details and try again.',
  401: 'Sign-in failed. Check your details and try again.',
};

const SIGN_UP_STATUS_MESSAGES: Record<number, string> = {
  ...SHARED_STATUS_MESSAGES,
  400: 'Check your details and try again.',
  409: 'An account with this email already exists.',
};

export function getSignInErrorMessage(status: number): string {
  return SIGN_IN_STATUS_MESSAGES[status] ?? UNEXPECTED_ERROR_MESSAGE;
}

async function readErrorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    const code = (body as { code?: unknown } | null)?.code;
    return typeof code === 'string' ? code : null;
  } catch {
    return null;
  }
}

export async function getSignUpErrorNotice(response: Response): Promise<FormErrorNotice> {
  // Retrying would only produce a 409, so point the user to sign-in instead.
  if ((await readErrorCode(response)) === 'ACCOUNT_CREATED_SESSION_FAILED') {
    return {
      variant: 'warning',
      message: "Your account was created, but we couldn't sign you in automatically. Please sign in.",
    };
  }

  return {
    variant: 'error',
    message: SIGN_UP_STATUS_MESSAGES[response.status] ?? UNEXPECTED_ERROR_MESSAGE,
  };
}
