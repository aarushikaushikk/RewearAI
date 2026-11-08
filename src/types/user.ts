export interface UserRecord {
  id: string;
  email: string; // Normalized lowercase, trimmed
  passwordHash: string | null; // Null for accounts with no password, which can't use password sign-in
  name?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// A user loaded without credentials, for everything except checking a password
export type UserWithoutPassword = Omit<UserRecord, 'passwordHash'>;

export interface CreateUserDTO {
  email: string;
  passwordHash: string;
  name?: string | null;
}

// A user who signs in through a provider. There is deliberately no way to set a password here.
export interface CreatePasswordlessUserDTO {
  id: string;
  email: string;
  name?: string | null;
}

export interface SafeUser {
  id: string;
  email: string;
  name?: string | null;
  createdAt: Date;
}
