import { Types } from "mongoose";
import { describe, expect, expectTypeOf, it } from "vitest";
import { toValidationError } from "../../tests/validationError";
import { WardrobeItem } from "./WardrobeItem";

function validItem(overrides: Record<string, unknown> = {}) {
  return {
    owner: new Types.ObjectId(),
    image: {
      url: "https://res.cloudinary.com/rewear/image/upload/v1/wardrobe/abc.jpg",
      publicId: "wardrobe/abc",
    },
    name: "Linen shirt",
    category: "Top",
    color: "White",
    style: "Button-down",
    season: "Summer",
    formality: "Smart casual",
    ...overrides,
  };
}

function validate(overrides: Record<string, unknown>) {
  return new WardrobeItem(validItem(overrides))
    .validate()
    .catch(toValidationError);
}

describe("WardrobeItem model", () => {
  it("accepts a valid item and defaults to available", async () => {
    const item = new WardrobeItem(validItem());

    await expect(item.validate()).resolves.toBeUndefined();
    expect(item.isAvailable).toBe(true);
  });

  it("allows an item without a name", async () => {
    const item = new WardrobeItem(validItem({ name: undefined }));

    await expect(item.validate()).resolves.toBeUndefined();
  });

  it("records created and updated timestamps", () => {
    expect(WardrobeItem.schema.get("timestamps")).toBe(true);
  });

  it("references its owning User", () => {
    expect(WardrobeItem.schema.path("owner").options.ref).toBe("User");
  });

  it("rejects a second item for the same Cloudinary image", () => {
    expect(WardrobeItem.schema.indexes()).toContainEqual([
      { "image.publicId": 1 },
      expect.objectContaining({ unique: true }),
    ]);
  });

  it("exposes typed documents rather than any", () => {
    const item = new WardrobeItem(validItem());

    expectTypeOf(item.style).toEqualTypeOf<string>();
    expectTypeOf(item.isAvailable).toEqualTypeOf<boolean>();
  });

  it.each(["owner", "category", "color", "style", "season", "formality"])(
    "rejects an item missing %s",
    async (field) => {
      const error = await validate({ [field]: undefined });

      expect(error?.errors[field]?.kind).toBe("required");
    },
  );

  it.each(["url", "publicId"])(
    "rejects an item missing image.%s",
    async (field) => {
      const image = { ...validItem().image, [field]: undefined };

      const error = await validate({ image });

      expect(error?.errors[`image.${field}`]?.kind).toBe("required");
    },
  );

  it.each([
    ["category", "Hat"],
    ["color", "Chartreuse"],
    ["season", "Monsoon"],
    ["formality", "Black tie"],
  ])("rejects an invalid %s value", async (field, value) => {
    const error = await validate({ [field]: value });

    expect(error?.errors[field]?.kind).toBe("enum");
  });

  it("rejects a non-https image URL", async () => {
    const image = { ...validItem().image, url: "http://example.com/a.jpg" };

    const error = await validate({ image });

    expect(error?.errors["image.url"]).toBeDefined();
  });

  it("rejects a blank style", async () => {
    const error = await validate({ style: "   " });

    expect(error?.errors.style?.kind).toBe("required");
  });

  it("rejects a name longer than 80 characters", async () => {
    const error = await validate({ name: "x".repeat(81) });

    expect(error?.errors.name?.kind).toBe("maxlength");
  });
});
