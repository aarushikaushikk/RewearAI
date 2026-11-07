import { handleLogin } from '@/lib/auth/authHandlers';

export async function POST(req: Request): Promise<Response> {
  return handleLogin(req);
}
