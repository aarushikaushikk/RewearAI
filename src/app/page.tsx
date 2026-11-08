import { redirect } from 'next/navigation';
import { HOME_PATH } from '@/lib/routes';

/**
 * Home lives at /home. A visitor with no session cookie never reaches this page:
 * the proxy sends them to sign-in first.
 */
export default function RootPage() {
  redirect(HOME_PATH);
}
