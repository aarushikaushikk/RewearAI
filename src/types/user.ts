export interface UserRecord {
  id: string;
  email: string; // Normalized lowercase, trimmed
  passwordHash: string;
  name?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserDTO {
  email: string;
  passwordHash: string;
  name?: string | null;
}
