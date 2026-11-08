import 'server-only';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

export const TRANSACTION_LIFETIME_MS = 10 * 60 * 1000;

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_INFO = 'rewear-google-transaction-v1';

/** The values a sign-in attempt must present again when the browser returns from Google. */
export interface GoogleTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
}

function keyFrom(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, '', KEY_INFO, 32));
}

/**
 * Encrypts a transaction for the browser to hold in a cookie. AES-GCM also authenticates it,
 * so it can't be changed or made up, and the expiry inside applies whatever the cookie says.
 */
export function sealTransaction(
  transaction: GoogleTransaction,
  secret: string,
  now: number,
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const payload = JSON.stringify({ ...transaction, expiresAt: now + TRANSACTION_LIFETIME_MS });
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

/** Returns null for anything but an unexpired transaction sealed with this secret. */
export function openTransaction(
  sealed: string,
  secret: string,
  now: number,
): GoogleTransaction | null {
  const bytes = Buffer.from(sealed, 'base64url');
  if (bytes.length <= IV_BYTES + TAG_BYTES) {
    return null;
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', keyFrom(secret), bytes.subarray(0, IV_BYTES));
    decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    const decrypted = Buffer.concat([
      decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]);
    const { state, nonce, codeVerifier, expiresAt } = JSON.parse(decrypted.toString('utf8'));
    return now > expiresAt ? null : { state, nonce, codeVerifier };
  } catch {
    return null;
  }
}
