import { createHash } from 'node:crypto';

// MongoDB uses this database when the connection string names none.
const DEFAULT_DATABASE = 'test';

/**
 * Identifies the database behind `mongodbUri` without revealing it: a hash of its hosts
 * and database name, ignoring credentials and options.
 *
 * Every environment shares one Cloudinary account, but cleanup can only check uploads
 * against its own database. Tagging uploads with this scope keeps each environment's
 * cleanup to the uploads it made, so none can delete another's saved photos (#50).
 */
export function uploadScopeFor(mongodbUri: string): string {
  const match = /^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)(?:\/([^?]*))?/.exec(mongodbUri.trim());
  if (!match) {
    throw new Error('Not a MongoDB connection string');
  }
  const hosts = match[1].toLowerCase().split(',').sort().join(',');
  const database = decodeURIComponent(match[2] ?? '') || DEFAULT_DATABASE;
  return createHash('sha256').update(`${hosts}/${database}`).digest('hex').slice(0, 12);
}
