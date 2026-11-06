import 'server-only';
import { Session } from '@/models/Session';
import { CreateSessionDTO, SessionRecord } from '@/types/session';
import { isObjectIdString, withDatabase } from './mongoSupport';
import { RepositoryError } from './repositoryErrors';
import { ISessionRepository } from './sessionRepository';

// The form hashToken() produces. Checked before querying, because Mongoose would
// otherwise run an object such as { $ne: null } as an operator and match any session.
const TOKEN_HASH_PATTERN = /^[a-f0-9]{64}$/;

function isTokenHash(tokenHash: unknown): tokenHash is string {
  return typeof tokenHash === 'string' && TOKEN_HASH_PATTERN.test(tokenHash);
}

interface StoredSession {
  _id: { toString(): string };
  userId: { toString(): string };
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt?: Date | null;
}

function toSessionRecord(session: StoredSession): SessionRecord {
  return {
    id: session._id.toString(),
    userId: session.userId.toString(),
    tokenHash: session.tokenHash,
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
    revokedAt: session.revokedAt ?? null,
  };
}

export class MongoSessionRepository implements ISessionRepository {
  async createSession(data: CreateSessionDTO): Promise<SessionRecord> {
    if (!isObjectIdString(data.userId)) {
      throw new RepositoryError();
    }
    return withDatabase(async () =>
      toSessionRecord(
        await Session.create({
          userId: data.userId,
          tokenHash: data.tokenHash,
          expiresAt: data.expiresAt,
        }),
      ),
    );
  }

  async findActiveSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    if (!isTokenHash(tokenHash)) {
      return null;
    }
    return withDatabase(async () => {
      // Checked here because MongoDB deletes expired sessions only periodically.
      const session = await Session.findOne({
        tokenHash,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      }).lean();
      return session ? toSessionRecord(session) : null;
    });
  }

  async revokeSessionByTokenHash(tokenHash: string): Promise<boolean> {
    if (!isTokenHash(tokenHash)) {
      return false;
    }
    return withDatabase(async () => {
      // A single conditional update, so only one concurrent revocation can succeed.
      const { modifiedCount } = await Session.updateOne(
        { tokenHash, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
      return modifiedCount === 1;
    });
  }

  async revokeAllSessionsForUser(userId: string): Promise<number> {
    if (!isObjectIdString(userId)) {
      return 0;
    }
    return withDatabase(async () => {
      const { modifiedCount } = await Session.updateMany(
        { userId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
      return modifiedCount;
    });
  }
}
