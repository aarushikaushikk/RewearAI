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

  it.each(["owner", "occasion"])(
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

  // US9 saves outfits before US13 adds explanations, so an outfit may have none yet.
  it("accepts an outfit without an explanation", async () => {
    await expect(validate({ explanation: undefined })).resolves.toBeUndefined();
  });

  it("stores a blank explanation as no explanation", async () => {
    const outfit = new Outfit(validOutfit({ explanation: "   " }));

    await expect(outfit.validate()).resolves.toBeUndefined();
    expect(outfit.explanation).toBeUndefined();
  });

  it("has no saved date until it is saved", () => {
    expect(new Outfit(validOutfit()).savedAt).toBeUndefined();
  });

  it("records when it was saved", async () => {
    const savedAt = new Date("2026-11-11T09:30:00.000Z");
    const outfit = new Outfit(validOutfit({ isSaved: true, savedAt }));

    await expect(outfit.validate()).resolves.toBeUndefined();
    expect(outfit.savedAt).toEqual(savedAt);
  });

  it("indexes saved outfits by owner, newest saved first", () => {
    expect(Outfit.schema.indexes()).toContainEqual([
      { owner: 1, isSaved: 1, savedAt: -1 },
      expect.anything(),
    ]);
  });

  it("rejects an explanation longer than 500 characters", async () => {
    const error = await validate({ explanation: "x".repeat(501) });

    expect(error?.errors.explanation?.kind).toBe("maxlength");
  });

  it("exposes typed documents rather than any", () => {
    const outfit = new Outfit(validOutfit());

    expectTypeOf(outfit.explanation).toEqualTypeOf<string | null | undefined>();
    expectTypeOf(outfit.savedAt).toEqualTypeOf<NativeDate | null | undefined>();
    expectTypeOf(outfit.isSaved).toEqualTypeOf<boolean>();
  });
});
