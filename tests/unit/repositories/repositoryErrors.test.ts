import { describe, it, expect } from 'vitest';
import {
  DuplicateEmailError,
  RepositoryError,
  RepositoryUnavailableError,
} from '@/lib/repositories/repositoryErrors';

describe('repository errors', () => {
  it.each([
    ['RepositoryError', () => new RepositoryError()],
    ['RepositoryUnavailableError', () => new RepositoryUnavailableError()],
    ['DuplicateEmailError', () => new DuplicateEmailError()],
  ])('%s is an Error with its own name', (name, make) => {
    const err = make();

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RepositoryError);
    expect(err.name).toBe(name);
  });

  it('lets callers tell an outage from other repository failures', () => {
    expect(new RepositoryUnavailableError()).toBeInstanceOf(RepositoryUnavailableError);
    expect(new RepositoryError()).not.toBeInstanceOf(RepositoryUnavailableError);
    expect(new DuplicateEmailError()).not.toBeInstanceOf(RepositoryUnavailableError);
  });

  it('accepts no driver text, so messages stay fixed and safe', () => {
    const cases = [
      new (RepositoryError as unknown as new (m: string) => Error)('mongodb://user:secret@host'),
      new (RepositoryUnavailableError as unknown as new (m: string) => Error)(
        'mongodb://user:secret@host',
      ),
      new (DuplicateEmailError as unknown as new (m: string) => Error)('person@example.com'),
    ];

    for (const err of cases) {
      expect(err.message).not.toMatch(/secret|mongodb|person@example/);
      expect(err.cause).toBeUndefined();
    }
  });
});
