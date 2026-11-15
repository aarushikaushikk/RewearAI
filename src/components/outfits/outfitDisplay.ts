// Display helpers shared by the outfit screens. Client-safe: no server imports.

import type { Occasion } from '@/types/outfit';

export const OCCASION_LABELS: Record<Occasion, string> = {
  work: 'Work',
  dinner: 'Dinner',
  weekend: 'Weekend',
  casual: 'Casual',
  formal: 'Formal',
};

// Same as SIGN_IN_SESSION_ENDED_PATH, which lives in a server-only module; a test keeps them in sync.
export const SIGN_IN_SESSION_ENDED_PATH = '/sign-in?reason=session-ended';

export const SECONDARY_ACTION =
  'inline-flex min-h-11 items-center justify-center rounded-xl border border-text-muted bg-surface px-4 font-medium text-text hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2';

/** The item's name, or its color and style when it has none (as on the Add Clothing card). */
export function displayName(item: { name: string | null; color: string; style: string }): string {
  return item.name ?? `${item.color} ${item.style}`;
}
