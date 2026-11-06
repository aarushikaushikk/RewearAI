import { Types } from "mongoose";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { FeedbackRating } from "@/types/outfit";
import { toValidationError } from "../../tests/validationError";
import { Feedback } from "./Feedback";

function validFeedback(overrides: Record<string, unknown> = {}) {
  return {
    owner: new Types.ObjectId(),
    outfit: new Types.ObjectId(),
    rating: "positive",
    ...overrides,
  };
}

function validate(overrides: Record<string, unknown>) {
  return new Feedback(validFeedback(overrides))
    .validate()
    .catch(toValidationError);
}

describe("Feedback model", () => {
  it.each(["positive", "negative"])("accepts %s feedback", async (rating) => {
    const feedback = new Feedback(validFeedback({ rating }));

    await expect(feedback.validate()).resolves.toBeUndefined();
  });

  it("records created and updated timestamps", () => {
    expect(Feedback.schema.get("timestamps")).toBe(true);
  });

  it.each([
    ["owner", "User"],
    ["outfit", "Outfit"],
  ])("references %s by %s ID", (field, ref) => {
    expect(Feedback.schema.path(field).options.ref).toBe(ref);
  });

  it.each(["owner", "outfit", "rating"])(
    "rejects feedback missing %s",
    async (field) => {
      const error = await validate({ [field]: undefined });

      expect(error?.errors[field]?.kind).toBe("required");
    },
  );

  it.each(["neutral", "Positive"])(
    "rejects an invalid rating (%s)",
    async (rating) => {
      const error = await validate({ rating });

      expect(error?.errors.rating?.kind).toBe("enum");
    },
  );

  it("allows only one feedback record per outfit", () => {
    expect(Feedback.schema.path("outfit").options.unique).toBe(true);
  });

  it("exposes typed documents rather than any", () => {
    const feedback = new Feedback(validFeedback());

    expectTypeOf(feedback.rating).toEqualTypeOf<FeedbackRating>();
  });
});
