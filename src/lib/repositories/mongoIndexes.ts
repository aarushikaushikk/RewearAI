import 'server-only';
import type { Connection } from 'mongoose';
import { Account } from '@/models/Account';
import { Feedback } from '@/models/Feedback';
import { Outfit } from '@/models/Outfit';
import { OutfitHistory } from '@/models/OutfitHistory';
import { Session } from '@/models/Session';
import { User } from '@/models/User';
import { WardrobeItem } from '@/models/WardrobeItem';

// Kept on globalThis like the connection in db.ts, because Next.js bundles routes separately.
const globalForIndexes = globalThis as typeof globalThis & {
  requiredIndexInitialization?: Map<string, Promise<void>>;
};

const initialization = (globalForIndexes.requiredIndexInitialization ??= new Map());

/**
 * Builds the indexes that repositories rely on, once for each database. Concurrent callers
 * share one attempt, success is remembered, and a failed attempt is forgotten so the
 * next caller retries.
 *
 * Mongoose's own index build on connect can't be relied on: it runs in the background,
 * so writes can overtake it, and it isn't retried after it fails. Without the unique
 * indexes, concurrent requests store duplicate emails, token hashes, account links, and
 * wardrobe items for one image, and two ratings for one outfit.
 */
export function ensureRequiredIndexes(connection: Connection): Promise<void> {
  const database = `${connection.host}:${connection.port}/${connection.name}`;

  const existing = initialization.get(database);
  if (existing) {
    return existing;
  }

  const attempt = Promise.all([
    User.createIndexes(),
    Session.createIndexes(),
    Account.createIndexes(),
    WardrobeItem.createIndexes(),
    Outfit.createIndexes(),
    OutfitHistory.createIndexes(),
    Feedback.createIndexes(),
  ]).then(() => undefined);
  initialization.set(database, attempt);
  attempt.catch(() => {
    initialization.delete(database);
  });
  return attempt;
}
