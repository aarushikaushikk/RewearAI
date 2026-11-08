import { expect } from 'vitest';
import mongoose from 'mongoose';

/** Every command Mongoose sends while `run` executes. */
export async function recordQueries(run: () => Promise<unknown>) {
  const queries: { method: string; args: unknown[] }[] = [];
  mongoose.set('debug', (_collection: string, method: string, ...args: unknown[]) => {
    queries.push({ method, args });
  });
  try {
    await run();
  } finally {
    mongoose.set('debug', false);
  }
  return queries;
}

export async function errorFrom(run: () => Promise<unknown>): Promise<Error> {
  const err = await run().then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Error);
  return err as Error;
}
