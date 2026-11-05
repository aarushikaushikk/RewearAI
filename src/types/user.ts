export interface UserRecord {
  id: string;
  email: string; // Normalized lowercase, trimmed
  passwordHash: string | null; // Null for accounts with no password, which can't use password sign-in
  name?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDTO {
  email: string;
  passwordHash: string;
  name?: string | null;
}

export interface SafeUser {
  id: string;
  email: string;
  name?: string | null;
  createdAt: Date;
}
