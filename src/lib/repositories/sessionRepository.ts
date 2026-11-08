import { SessionRecord, CreateSessionDTO } from '@/types/session';

export interface ISessionRepository {
  createSession(data: CreateSessionDTO): Promise<SessionRecord>;
  findActiveSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  revokeSessionByTokenHash(tokenHash: string): Promise<boolean>;
}
