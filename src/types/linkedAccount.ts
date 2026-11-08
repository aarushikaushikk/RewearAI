import type { AuthProvider } from '@/types/account';

export interface LinkedAccountRecord {
  id: string;
  userId: string;
  provider: AuthProvider;
  providerAccountId: string; // The provider's stable user ID, such as Google's `sub`
  createdAt: Date;
}

export interface CreateLinkedAccountDTO {
  userId: string;
  provider: AuthProvider;
  providerAccountId: string;
}
