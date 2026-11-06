import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const connect = vi.fn();

vi.mock("mongoose", () => ({ default: { connect } }));

const SECRET_URI =
  "mongodb+srv://rewear-user:s3cr3t-pass@cluster0.abcde.mongodb.net/rewear";

// db.ts keeps its cache on globalThis; reload it fresh for every test.
async function loadDb() {
  delete (globalThis as { mongooseCache?: unknown }).mongooseCache;
  vi.resetModules();
  return import("./db");
}

function loggedText(spy: ReturnType<typeof vi.spyOn>) {
  return JSON.stringify(spy.mock.calls);
}

describe("connectToDatabase", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    connect.mockReset();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    consoleError.mockRestore();
  });

  it("throws a safe error when MONGODB_URI is not set", async () => {
    vi.stubEnv("MONGODB_URI", "");
    const {
      connectToDatabase,
      DatabaseConnectionError,
      DB_CONNECTION_ERROR_MESSAGE,
    } = await loadDb();

    const error = await connectToDatabase().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DatabaseConnectionError);
    expect((error as Error).message).toBe(DB_CONNECTION_ERROR_MESSAGE);
    expect(connect).not.toHaveBeenCalled();
  });

  it("hides the URI and driver details when the connection fails", async () => {
    vi.stubEnv("MONGODB_URI", SECRET_URI);
    connect.mockRejectedValue(
      new Error(`querySrv ENOTFOUND _mongodb._tcp for ${SECRET_URI}`),
    );
    const {
      connectToDatabase,
      DatabaseConnectionError,
      DB_CONNECTION_ERROR_MESSAGE,
    } = await loadDb();

    const error = await connectToDatabase().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DatabaseConnectionError);
    expect((error as Error).message).toBe(DB_CONNECTION_ERROR_MESSAGE);
    expect((error as Error).message).not.toContain("s3cr3t-pass");
    expect(loggedText(consoleError)).not.toContain("s3cr3t-pass");
    expect(loggedText(consoleError)).not.toContain("cluster0.abcde");
  });

  it("connects with the configured URI and reuses the connection", async () => {
    vi.stubEnv("MONGODB_URI", SECRET_URI);
    const connection = { connection: "ok" };
    connect.mockResolvedValue(connection);
    const { connectToDatabase } = await loadDb();

    const first = await connectToDatabase();
    const second = await connectToDatabase();

    expect(first).toBe(connection);
    expect(second).toBe(connection);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith(SECRET_URI, { bufferCommands: false });
  });

  it("shares one connection attempt between concurrent callers", async () => {
    vi.stubEnv("MONGODB_URI", SECRET_URI);
    connect.mockResolvedValue({ connection: "ok" });
    const { connectToDatabase } = await loadDb();

    await Promise.all([connectToDatabase(), connectToDatabase()]);

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("retries on the next call after a failed connection", async () => {
    vi.stubEnv("MONGODB_URI", SECRET_URI);
    const connection = { connection: "ok" };
    connect
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce(connection);
    const { connectToDatabase, DatabaseConnectionError } = await loadDb();

    await expect(connectToDatabase()).rejects.toBeInstanceOf(
      DatabaseConnectionError,
    );
    await expect(connectToDatabase()).resolves.toBe(connection);
    expect(connect).toHaveBeenCalledTimes(2);
  });
});
