import { connection } from 'next/server';
import { handleGoogleStart } from '@/lib/auth/googleHandlers';

export async function GET(): Promise<Response> {
  // This route reads nothing from the request, so it must be told not to prerender.
  // A prerendered response would give every visitor the same state and nonce.
  await connection();
  return handleGoogleStart();
}
