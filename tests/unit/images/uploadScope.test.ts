import { describe, expect, it } from 'vitest';
import { uploadScopeFor } from '@/lib/images/uploadScope';

// Production and local development share one Cloudinary account. The scope keeps
// each database's cleanup to the uploads it made itself (#50).
describe('uploadScopeFor', () => {
  const ATLAS = 'mongodb+srv://alex:s3cret@cluster0.abc12.mongodb.net/rewear?retryWrites=true&w=majority';

  it('is a short hex string that does not reveal the connection string', () => {
    const scope = uploadScopeFor(ATLAS);

    expect(scope).toMatch(/^[0-9a-f]{12}$/);
    expect(scope).not.toContain('s3cret');
  });

  it('is the same for the same database, whatever the credentials or options', () => {
    expect(uploadScopeFor(ATLAS)).toBe(
      uploadScopeFor('mongodb+srv://sam:other@cluster0.abc12.mongodb.net/rewear'),
    );
  });

  it('differs for another database name on the same cluster', () => {
    expect(uploadScopeFor(ATLAS)).not.toBe(
      uploadScopeFor('mongodb+srv://alex:s3cret@cluster0.abc12.mongodb.net/rewear-dev'),
    );
  });

  it('differs for the same database name on another cluster', () => {
    expect(uploadScopeFor(ATLAS)).not.toBe(
      uploadScopeFor('mongodb+srv://alex:s3cret@cluster1.xyz34.mongodb.net/rewear'),
    );
  });

  it('ignores host order and case in a replica set list', () => {
    expect(uploadScopeFor('mongodb://a.example.com:27017,B.example.com:27017/rewear')).toBe(
      uploadScopeFor('mongodb://b.example.com:27017,a.example.com:27017/rewear?replicaSet=rs0'),
    );
  });

  it("uses MongoDB's default database, test, when the URI names none", () => {
    expect(uploadScopeFor('mongodb://localhost:27017')).toBe(
      uploadScopeFor('mongodb://localhost:27017/test'),
    );
    expect(uploadScopeFor('mongodb://localhost:27017/?directConnection=true')).toBe(
      uploadScopeFor('mongodb://localhost:27017/test'),
    );
  });

  it('rejects a string that is not a MongoDB connection string', () => {
    expect(() => uploadScopeFor('https://example.com/rewear')).toThrow();
    expect(() => uploadScopeFor('mongodb:///rewear')).toThrow();
  });
});
