import { Types } from "mongoose";
import { describe, expect, expectTypeOf, it } from "vitest";
import { toValidationError } from "../../tests/validationError";
import { OutfitHistory } from "./OutfitHistory";

function validEntry(overrides: Record<string, unknown> = {}) {
  return {
    owner: new Types.ObjectId(),
    outfit: new Types.ObjectId(),
    wornOn: "2026-11-04",
    combinationKey: "64c0000000000000000000a1,64c0000000000000000000a2",
    ...overrides,
  };
}

function validate(overrides: Record<string, unknown>) {
  return new OutfitHistory(validEntry(overrides))
    .validate()
    .catch(toValidationError);
}

describe("OutfitHistory model", () => {
  it("accepts a valid worn record", async () => {
    const entry = new OutfitHistory(validEntry());

    await expect(entry.validate()).resolves.toBeUndefined();
  });

  it("keeps the user's local calendar date exactly as given", () => {
    const entry = new OutfitHistory(validEntry({ wornOn: "2026-12-31" }));

    expect(entry.wornOn).toBe("2026-12-31");
  });

  it("accepts a leap day", async () => {
    const error = await validate({ wornOn: "2028-02-29" });

    expect(error).toBeUndefined();
  });

  it("records created and updated timestamps", () => {
    expect(OutfitHistory.schema.get("timestamps")).toBe(true);
  });

  it.each([
    ["owner", "User"],
    ["outfit", "Outfit"],
  ])("references %s by %s ID", (field, ref) => {
    expect(OutfitHistory.schema.path(field).options.ref).toBe(ref);
  });

  it.each(["owner", "outfit", "wornOn", "combinationKey"])(
    "rejects a record missing %s",
    async (field) => {
      const error = await validate({ [field]: undefined });

      expect(error?.errors[field]?.kind).toBe("required");
    },
  );

  it.each([
    ["a full timestamp", "2026-11-04T18:45:12.000Z"],
    ["a US-style date", "11/04/2026"],
    ["a day that does not exist", "2026-02-30"],
    ["a month that does not exist", "2026-13-01"],
    ["free text", "yesterday"],
  ])("rejects %s as the worn date", async (_label, wornOn) => {
    const error = await validate({ wornOn });

    expect(error?.errors.wornOn).toBeDefined();
  });

  it("allows an outfit to be recorded as worn only once per day", () => {
    expect(OutfitHistory.schema.indexes()).toContainEqual([
      { outfit: 1, wornOn: 1 },
      expect.objectContaining({ unique: true }),
    ]);
  });

  it("allows the same clothes to be recorded as worn only once per user per day (US10)", () => {
    expect(OutfitHistory.schema.indexes()).toContainEqual([
      { owner: 1, wornOn: 1, combinationKey: 1 },
      expect.objectContaining({ unique: true }),
    ]);
  });

  it("rejects a blank combination key", async () => {
    const error = await validate({ combinationKey: "   " });

    expect(error?.errors.combinationKey?.kind).toBe("required");
  });

  it("indexes each user's history newest first", () => {
    expect(OutfitHistory.schema.indexes()).toContainEqual([
      { owner: 1, wornOn: -1 },
      expect.anything(),
    ]);
  });

  it("exposes typed documents rather than any", () => {
    const entry = new OutfitHistory(validEntry());

    expectTypeOf(entry.wornOn).toEqualTypeOf<string>();
    expectTypeOf(entry.combinationKey).toEqualTypeOf<string>();
  });
});
