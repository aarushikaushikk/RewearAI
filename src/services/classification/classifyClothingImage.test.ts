import { describe, expect, it, vi } from "vitest";
import type { LabelScore, ZeroShotImageClassifier } from "@/types/classification";
import { ALL_PROMPTS } from "./clothingLabels";
import { classifyClothingImage } from "./classifyClothingImage";

// Test doubles stand in for the browser model. They are never used outside tests.
const image = new Blob(["fake image bytes"], { type: "image/jpeg" });

function classifierReturning(result: unknown): ZeroShotImageClassifier {
  return vi.fn(async () => result as LabelScore[]);
}

describe("classifyClothingImage", () => {
  it("sends the image and every prompt to the classifier in one call", async () => {
    const classifier = classifierReturning([]);
    await classifyClothingImage(image, classifier);
    expect(classifier).toHaveBeenCalledTimes(1);
    expect(classifier).toHaveBeenCalledWith(image, ALL_PROMPTS);
  });

  it("returns normalized suggestions from the classifier's scores", async () => {
    const result = await classifyClothingImage(
      image,
      classifierReturning([
        { label: "a photo of a pair of sneakers", score: 0.5 },
        { label: "a photo of a white clothing item", score: 0.4 },
        { label: "a photo of casual everyday clothing", score: 0.1 },
      ]),
    );
    expect(result).toEqual({
      status: "ok",
      suggestions: {
        category: { status: "suggested", value: "Shoes" },
        color: { status: "suggested", value: "White" },
        style: { status: "suggested", value: "Sneakers" },
        season: { status: "missing" },
        formality: { status: "uncertain", value: "Casual" },
      },
      fieldsNeedingReview: ["season", "formality"],
    });
  });

  it("is unavailable when no classifier could be loaded", async () => {
    expect(await classifyClothingImage(image, null)).toEqual({
      status: "failed",
      reason: "unavailable",
    });
  });

  it("is unavailable when the classifier throws, without exposing the error", async () => {
    const classifier: ZeroShotImageClassifier = async () => {
      throw new Error("WebAssembly out of memory at /internal/path");
    };
    expect(await classifyClothingImage(image, classifier)).toEqual({
      status: "failed",
      reason: "unavailable",
    });
  });

  it("fails with invalid_output when the classifier returns something other than a list", async () => {
    expect(await classifyClothingImage(image, classifierReturning({ label: "x" }))).toEqual({
      status: "failed",
      reason: "invalid_output",
    });
  });

  it("fails with not_clothing when non-clothing prompts win", async () => {
    const result = await classifyClothingImage(
      image,
      classifierReturning([
        { label: "a photo of food", score: 0.8 },
        { label: "a photo of a t-shirt", score: 0.2 },
      ]),
    );
    expect(result).toEqual({ status: "failed", reason: "not_clothing" });
  });
});
