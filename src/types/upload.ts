// Clothing image upload limits, shared by the upload API and the Add Clothing form.
// Client-safe: no server imports.

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Stays under Vercel's 4.5 MB request body limit for Route Handlers. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** The browser shrinks photos to this longest edge before upload. */
export const MAX_IMAGE_DIMENSION = 2000;

export const ACCEPTED_IMAGE_LABEL = 'JPEG, PNG, or WebP';
export const MAX_IMAGE_LABEL = '4 MB';

export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];
