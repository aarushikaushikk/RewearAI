import { ISessionRepository } from '@/lib/repositories/sessionRepository';
import { SessionRecord, CreateSessionDTO } from '@/types/session';

export class MemorySessionRepository implements ISessionRepository {
  private sessions: SessionRecord[] = [];
  private nextId = 1;

  async createSession(data: CreateSessionDTO): Promise<SessionRecord> {
    const session: SessionRecord = {
      id: `session_${this.nextId++}`,
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
      revokedAt: null,
    };
    this.sessions.push(session);
    return { ...session };
  }

  async findActiveSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const now = new Date();
    const session = this.sessions.find(
      (s) => s.tokenHash === tokenHash && !s.revokedAt && s.expiresAt > now
    );
    return session ? { ...session } : null;
  }

  async revokeSessionByTokenHash(tokenHash: string): Promise<boolean> {
    const session = this.sessions.find((s) => s.tokenHash === tokenHash && !s.revokedAt);
    if (session) {
      session.revokedAt = new Date();
      return true;
    }
    return false;
  }

  async revokeAllSessionsForUser(userId: string): Promise<number> {
    const now = new Date();
    let count = 0;
    for (const session of this.sessions) {
      if (session.userId === userId && !session.revokedAt) {
        session.revokedAt = now;
        count++;
      }
    }
    return count;
  }

  // Helper for test cleanup
  clear(): void {
    this.sessions = [];
    this.nextId = 1;
  }
}
