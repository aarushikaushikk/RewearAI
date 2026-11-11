'use client';

import React, { useState } from 'react';
import Image from 'next/image';

/** The only host next/image may load from (images.remotePatterns in next.config.ts); a test keeps them in sync. */
export const ALLOWED_IMAGE_HOST = 'res.cloudinary.com';

/**
 * Returns `url` only when next/image is allowed to load it: https, the allowed host, no
 * credentials or port. Anything else would make next/image throw and take the page down.
 */
export function allowedImageUrl(url: unknown): string | null {
  if (typeof url !== 'string') {
    return null;
  }
  try {
    const parsed = new URL(url);
    const allowed =
      parsed.protocol === 'https:' &&
      parsed.hostname === ALLOWED_IMAGE_HOST &&
      parsed.port === '' &&
      parsed.username === '' &&
      parsed.password === '';
    return allowed ? url : null;
  } catch {
    return null;
  }
}

interface OutfitItemImageProps {
  /** Untrusted: the response's image URL, which may be missing or unsupported. */
  url: unknown;
  /** The item's readable name, used as the alt text. */
  name: string;
  sizes: string;
}

/**
 * A recommended item's photo, or a neutral "Image unavailable" placeholder when the URL is
 * missing or unsupported, or the photo fails to load (DESIGN §2). Fills a positioned parent.
 */
export function OutfitItemImage({ url, name, sizes }: OutfitItemImageProps) {
  const src = allowedImageUrl(url);
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={`Image unavailable for ${name}`}
        className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-text-muted"
      >
        Image unavailable
      </div>
    );
  }

  return (
    <Image src={src} alt={name} fill sizes={sizes} className="object-contain" onError={() => setFailed(true)} />
  );
}
