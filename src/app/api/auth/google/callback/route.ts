import { connection } from 'next/server';
import { handleGoogleCallback } from '@/lib/auth/googleHandlers';

export async function GET(req: Request): Promise<Response> {
  // Reading the request's URL doesn't stop Next.js prerendering this route at build,
  // which would answer every callback with the same response.
  await connection();
  return handleGoogleCallback(req);
}
