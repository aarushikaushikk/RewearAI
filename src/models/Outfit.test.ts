import { Types } from "mongoose";
import { describe, expect, expectTypeOf, it } from "vitest";
import { toValidationError } from "../../tests/validationError";
import { Outfit } from "./Outfit";

function validOutfit(overrides: Record<string, unknown> = {}) {
  return {
    owner: new Types.ObjectId(),
    items: [new Types.ObjectId(), new Types.ObjectId()],
    occasion: "work",
    explanation: "Navy trousers and a white shirt suit a smart casual workday.",
    ...overrides,
  };
}

function validate(overrides: Record<string, unknown>) {
  return new Outfit(validOutfit(overrides)).validate().catch(toValidationError);
}

describe("Outfit model", () => {
  it("accepts a valid outfit, unsaved and without feedback by default", async () => {
    const outfit = new Outfit(validOutfit());

    await expect(outfit.validate()).resolves.toBeUndefined();
    expect(outfit.isSaved).toBe(false);
    expect(outfit.feedback).toBeUndefined();
  });

  it("accepts a reference to its Feedback record", async () => {
    const outfit = new Outfit(validOutfit({ feedback: new Types.ObjectId() }));

    await expect(outfit.validate()).resolves.toBeUndefined();
  });

  it("records created and updated timestamps", () => {
    expect(Outfit.schema.get("timestamps")).toBe(true);
  });

  it.each([
    ["owner", "User"],
    ["items", "WardrobeItem"],
    ["feedback", "Feedback"],
  ])("references %s by %s ID", (field, ref) => {
    const options = Outfit.schema.path(field).options;

    expect(options.ref ?? options.type[0].ref).toBe(ref);
  });

  it.each(["owner", "occasion", "explanation"])(
    "rejects an outfit missing %s",
    async (field) => {
      const error = await validate({ [field]: undefined });

      expect(error?.errors[field]?.kind).toBe("required");
    },
  );

  it("rejects an outfit with no wardrobe items", async () => {
    const error = await validate({ items: [] });

    expect(error?.errors.items).toBeDefined();
  });

  it("rejects an outfit that lists the same item twice", async () => {
    const itemId = new Types.ObjectId();

    const error = await validate({ items: [itemId, itemId] });

    expect(error?.errors.items).toBeDefined();
  });

  it.each(["party", "Work"])(
    "rejects an occasion outside the PRD list (%s)",
    async (occasion) => {
      const error = await validate({ occasion });

      expect(error?.errors.occasion?.kind).toBe("enum");
    },
  );

  it("rejects a blank explanation", async () => {
    const error = await validate({ explanation: "   " });

    expect(error?.errors.explanation?.kind).toBe("required");
  });

  it("rejects an explanation longer than 500 characters", async () => {
    const error = await validate({ explanation: "x".repeat(501) });

    expect(error?.errors.explanation?.kind).toBe("maxlength");
  });

  it("exposes typed documents rather than any", () => {
    const outfit = new Outfit(validOutfit());

    expectTypeOf(outfit.explanation).toEqualTypeOf<string>();
    expectTypeOf(outfit.isSaved).toEqualTypeOf<boolean>();
  });
});
