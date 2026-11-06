import "server-only";
import mongoose from "mongoose";

/** Safe, client-facing message; never includes the URI or driver details. */
export const DB_CONNECTION_ERROR_MESSAGE =
  "We couldn't reach the database. Please try again shortly.";

export class DatabaseConnectionError extends Error {
  constructor() {
    super(DB_CONNECTION_ERROR_MESSAGE);
    this.name = "DatabaseConnectionError";
  }
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

// Reuse one connection across hot reloads in dev and warm serverless invocations.
const globalForMongoose = globalThis as typeof globalThis & {
  mongooseCache?: MongooseCache;
};

const cache: MongooseCache = (globalForMongoose.mongooseCache ??= {
  conn: null,
  promise: null,
});

export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cache.conn) {
    return cache.conn;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("[db] MONGODB_URI is not set");
    throw new DatabaseConnectionError();
  }

  cache.promise ??= mongoose.connect(uri, { bufferCommands: false });

  try {
    cache.conn = await cache.promise;
    return cache.conn;
  } catch (error) {
    // Clear the failed attempt so the next request retries instead of reusing it.
    cache.promise = null;
    // Log only the error type: driver messages can contain hosts or credentials.
    console.error(
      "[db] MongoDB connection failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    throw new DatabaseConnectionError();
  }
}
