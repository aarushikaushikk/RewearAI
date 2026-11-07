export interface CsrfValidationOptions {
  trustedOrigins?: string[];
  isProduction?: boolean;
}

/**
 * Validates and normalizes an origin URL string (e.g. 'https://rewear.app').
 * Returns the lowercased origin string or null if invalid or not http/https.
 */
function validateAndNormalizeOrigin(originStr: string): string | null {
  try {
    const url = new URL(originStr.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Strict CSRF Protection via Origin & Referer validation for state-changing requests.
 *
 * Rules:
 * - Safe methods (GET, HEAD, OPTIONS) are exempt.
 * - State-changing requests (POST, PUT, DELETE, PATCH) MUST have an Origin or Referer header.
 * - State-changing requests MUST have a valid Host header.
 * - In production: An explicitly configured, valid APP_ORIGIN (or trustedOrigins option)
 *   is strictly REQUIRED. Trusted origin is NEVER derived from an untrusted Host header.
 * - In development/test: If no explicit origin is set, same-origin is derived safely from Host.
 */
export function validateCsrfOrigin(
  request: Request,
  options?: CsrfValidationOptions
): boolean {
  const method = request.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return true;
  }

  const hostHeader = request.headers.get('host');
  if (!hostHeader || hostHeader.trim().length === 0) {
    return false;
  }

  const originHeader = request.headers.get('origin');
  const refererHeader = request.headers.get('referer');

  // Reject state-changing requests when both Origin and Referer are absent
  if (!originHeader && !refererHeader) {
    return false;
  }

  let candidateUrl: URL;
  try {
    if (originHeader) {
      candidateUrl = new URL(originHeader);
    } else if (refererHeader) {
      candidateUrl = new URL(refererHeader);
    } else {
      return false;
    }
  } catch {
    return false;
  }

  const isProduction =
    options?.isProduction ?? (process.env.NODE_ENV === 'production');

  // Build the set of trusted origins
  const trustedOrigins: string[] = [];

  if (options?.trustedOrigins && options.trustedOrigins.length > 0) {
    for (const origin of options.trustedOrigins) {
      const normalized = validateAndNormalizeOrigin(origin);
      if (normalized) {
        trustedOrigins.push(normalized);
      }
    }
  } else if (process.env.APP_ORIGIN) {
    const normalized = validateAndNormalizeOrigin(process.env.APP_ORIGIN);
    if (normalized) {
      trustedOrigins.push(normalized);
    }
  }

  if (isProduction) {
    // In production, an explicitly configured, validated trusted origin is REQUIRED.
    // Untrusted Host headers are NEVER used to determine trusted origins in production.
    if (trustedOrigins.length === 0) {
      return false;
    }
  } else {
    // In local development / test environments, if no explicit origin is provided,
    // allow same-origin matching against the local Host header.
    if (trustedOrigins.length === 0) {
      const cleanHost = hostHeader.toLowerCase().trim();
      trustedOrigins.push(`http://${cleanHost}`);
      trustedOrigins.push(`https://${cleanHost}`);
    }
  }

  const candidateOrigin = candidateUrl.origin.toLowerCase().trim();
  return trustedOrigins.includes(candidateOrigin);
}
