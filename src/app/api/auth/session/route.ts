import { handleGetSession } from '@/lib/auth/authHandlers';

export async function GET(req: Request): Promise<Response> {
  return handleGetSession(req);
}
