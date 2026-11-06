import { Types } from "mongoose";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { AuthProvider } from "@/types/account";
import { toValidationError } from "../../tests/validationError";
import { Account } from "./Account";

function validAccount(overrides: Record<string, unknown> = {}) {
  return {
    userId: new Types.ObjectId(),
    provider: "google",
    providerAccountId: "109876543210987654321",
    ...overrides,
  };
}

function validate(overrides: Record<string, unknown>) {
  return new Account(validAccount(overrides))
    .validate()
    .catch(toValidationError);
}

describe("Account model", () => {
  it("accepts a valid Google identity", async () => {
    const account = new Account(validAccount());

    await expect(account.validate()).resolves.toBeUndefined();
  });

  it("records created and updated timestamps", () => {
    expect(Account.schema.get("timestamps")).toBe(true);
  });

  it("references its User", () => {
    expect(Account.schema.path("userId").options.ref).toBe("User");
  });

  it.each(["userId", "provider", "providerAccountId"])(
    "rejects an account missing %s",
    async (field) => {
      const error = await validate({ [field]: undefined });

      expect(error?.errors[field]?.kind).toBe("required");
    },
  );

  it.each(["github", "Google"])(
    "rejects an unsupported provider (%s)",
    async (provider) => {
      const error = await validate({ provider });

      expect(error?.errors.provider?.kind).toBe("enum");
    },
  );

  it("rejects a blank provider account ID", async () => {
    const error = await validate({ providerAccountId: "   " });

    expect(error?.errors.providerAccountId?.kind).toBe("required");
  });

  it("links each Google account to only one user", () => {
    expect(Account.schema.indexes()).toContainEqual([
      { provider: 1, providerAccountId: 1 },
      expect.objectContaining({ unique: true }),
    ]);
  });

  it("gives each user at most one account per provider", () => {
    expect(Account.schema.indexes()).toContainEqual([
      { userId: 1, provider: 1 },
      expect.objectContaining({ unique: true }),
    ]);
  });

  it("does not store OAuth access or refresh tokens", () => {
    expect(Account.schema.path("access_token")).toBeUndefined();
    expect(Account.schema.path("refresh_token")).toBeUndefined();
  });

  it("exposes typed documents rather than any", () => {
    const account = new Account(validAccount());

    expectTypeOf(account.provider).toEqualTypeOf<AuthProvider>();
    expectTypeOf(account.providerAccountId).toEqualTypeOf<string>();
  });
});
