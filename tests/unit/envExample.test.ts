import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const text = readFileSync(path.resolve(__dirname, '../../.env.example'), 'utf8');

/** The KEY=value lines, ignoring comments. */
const entries = new Map(
  text
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
);

describe('.env.example', () => {
  it.each([
    'MONGODB_URI',
    'APP_ORIGIN',
    'TRUST_PROXY',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ])('documents %s', (name) => {
    expect(entries.has(name)).toBe(true);
  });

  it('holds only placeholders for the MongoDB connection string', () => {
    expect(entries.get('MONGODB_URI')).toContain('<username>:<password>@<cluster-host>');
  });

  it.each(['APP_ORIGIN', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'])(
    'leaves %s empty',
    (name) => {
      expect(entries.get(name)).toBe('');
    },
  );

  it('does not trust proxy headers by default', () => {
    expect(entries.get('TRUST_PROXY')).toBe('false');
  });

  it('is the only env file git tracks', () => {
    const ignore = readFileSync(path.resolve(__dirname, '../../.gitignore'), 'utf8');

    expect(ignore).toMatch(/^\.env\*$/m);
    expect(ignore).toMatch(/^!\.env\.example$/m);
  });
});
