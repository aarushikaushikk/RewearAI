import { Types } from "mongoose";
import { describe, expect, expectTypeOf, it } from "vitest";
import { toValidationError } from "../../tests/validationError";
import { Session } from "./Session";

// A SHA-256 hex digest, as produced by hashToken() in the auth code.
const TOKEN_HASH = "a1b2c3d4".repeat(8);

function validSession(overrides: Record<string, unknown> = {}) {
  return {
    userId: new Types.ObjectId(),
    tokenHash: TOKEN_HASH,
    expiresAt: new Date("2026-11-12T12:00:00.000Z"),
    ...overrides,
  };
}

function validate(overrides: Record<string, unknown>) {
  return new Session(validSession(overrides))
    .validate()
    .catch(toValidationError);
}

describe("Session model", () => {
  it("accepts a valid session that is not revoked", async () => {
    const session = new Session(validSession());

    await expect(session.validate()).resolves.toBeUndefined();
    expect(session.revokedAt).toBeNull();
  });

  it("accepts a revoked session (logout)", async () => {
    const error = await validate({ revokedAt: new Date() });

    expect(error).toBeUndefined();
  });

  it("records created and updated timestamps", () => {
    expect(Session.schema.get("timestamps")).toBe(true);
  });

  it("references its User", () => {
    expect(Session.schema.path("userId").options.ref).toBe("User");
  });

  it.each(["userId", "tokenHash", "expiresAt"])(
    "rejects a session missing %s",
    async (field) => {
      const error = await validate({ [field]: undefined });

      expect(error?.errors[field]?.kind).toBe("required");
    },
  );

  it.each([
    ["a raw token", "not-a-hash"],
    ["an uppercase digest", TOKEN_HASH.toUpperCase()],
    ["a short digest", "a1b2c3d4"],
  ])("rejects %s as the token hash", async (_label, tokenHash) => {
    const error = await validate({ tokenHash });

    expect(error?.errors.tokenHash).toBeDefined();
  });

  it("looks sessions up by a unique token hash", () => {
    expect(Session.schema.path("tokenHash").options.unique).toBe(true);
  });

  it("indexes sessions by user for sign-out everywhere", () => {
    expect(Session.schema.path("userId").options.index).toBe(true);
  });

  it("lets MongoDB delete sessions once they expire", () => {
    expect(Session.schema.indexes()).toContainEqual([
      { expiresAt: 1 },
      expect.objectContaining({ expireAfterSeconds: 0 }),
    ]);
  });

  it("exposes typed documents rather than any", () => {
    const session = new Session(validSession());

    expectTypeOf(session.tokenHash).toEqualTypeOf<string>();
    expectTypeOf(session.expiresAt).toEqualTypeOf<Date>();
  });
});
