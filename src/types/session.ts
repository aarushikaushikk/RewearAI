export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string; // SHA-256 hash of the opaque session token
  expiresAt: Date;
  createdAt: Date;
  revokedAt?: Date | null;
}

export interface CreateSessionDTO {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}
