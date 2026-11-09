import { describe, expect, it } from "vitest";
import { WardrobeItem } from "@/models/WardrobeItem";
import { STYLE_MAX_LENGTH } from "@/types/classification";
import { normalizeClassification } from "./normalizeClassification";

function rawResult(overrides: Record<string, unknown> = {}) {
  return {
    isClothing: true,
    category: { value: "Top", confidence: "high" },
    color: { value: "Navy", confidence: "high" },
    style: { value: "Button-down", confidence: "high" },
    season: { value: "All-season", confidence: "high" },
    formality: { value: "Smart casual", confidence: "high" },
    ...overrides,
  };
}

function suggestionsOf(raw: unknown) {
  const result = normalizeClassification(raw);
  if (result.status !== "ok") throw new Error(`expected ok, got ${result.reason}`);
  return result;
}

describe("normalizeClassification", () => {
  it("accepts a fully confident, valid result with nothing needing review", () => {
    expect(normalizeClassification(rawResult())).toEqual({
      status: "ok",
      suggestions: {
        category: { status: "suggested", value: "Top" },
        color: { status: "suggested", value: "Navy" },
        style: { status: "suggested", value: "Button-down" },
        season: { status: "suggested", value: "All-season" },
        formality: { status: "suggested", value: "Smart casual" },
      },
      fieldsNeedingReview: [],
    });
  });

  it("marks low or unreported confidence as uncertain but keeps the value", () => {
    const result = suggestionsOf(
      rawResult({
        color: { value: "Black", confidence: "low" },
        season: { value: "Winter" },
        formality: { value: "Formal", confidence: "certain" },
      }),
    );
    expect(result.suggestions.color).toEqual({ status: "uncertain", value: "Black" });
    expect(result.suggestions.season).toEqual({ status: "uncertain", value: "Winter" });
    expect(result.suggestions.formality).toEqual({ status: "uncertain", value: "Formal" });
    expect(result.fieldsNeedingReview).toEqual(["color", "season", "formality"]);
  });

  it("marks absent, null, and blank values as missing without filling them in", () => {
    const result = suggestionsOf(
      rawResult({
        category: undefined,
        color: { value: null, confidence: "high" },
        style: { value: "   ", confidence: "high" },
      }),
    );
    expect(result.suggestions.category).toEqual({ status: "missing" });
    expect(result.suggestions.color).toEqual({ status: "missing" });
    expect(result.suggestions.style).toEqual({ status: "missing" });
    expect(result.fieldsNeedingReview).toEqual(["category", "color", "style"]);
  });

  it("discards values outside the wardrobe enums instead of mapping them to a near match", () => {
    const result = suggestionsOf(
      rawResult({
        category: { value: "Jumpsuit", confidence: "high" },
        color: { value: "Navy blue", confidence: "high" },
        season: { value: 3, confidence: "high" },
        formality: { value: ["Formal"], confidence: "high" },
      }),
    );
    expect(result.suggestions.category).toEqual({ status: "invalid" });
    expect(result.suggestions.color).toEqual({ status: "invalid" });
    expect(result.suggestions.season).toEqual({ status: "invalid" });
    expect(result.suggestions.formality).toEqual({ status: "invalid" });
    expect(result.fieldsNeedingReview).toEqual(["category", "color", "season", "formality"]);
  });

  it("matches enum values case-insensitively and returns the canonical spelling", () => {
    const result = suggestionsOf(
      rawResult({
        category: { value: " outerwear ", confidence: "high" },
        formality: { value: "SMART CASUAL", confidence: "high" },
      }),
    );
    expect(result.suggestions.category).toEqual({ status: "suggested", value: "Outerwear" });
    expect(result.suggestions.formality).toEqual({ status: "suggested", value: "Smart casual" });
  });

  it("trims style and enforces the wardrobe model's length limit without truncating", () => {
    const atLimit = "a".repeat(STYLE_MAX_LENGTH);
    expect(
      suggestionsOf(rawResult({ style: { value: `  ${atLimit}  `, confidence: "high" } }))
        .suggestions.style,
    ).toEqual({ status: "suggested", value: atLimit });
    expect(
      suggestionsOf(rawResult({ style: { value: `${atLimit}b`, confidence: "high" } }))
        .suggestions.style,
    ).toEqual({ status: "invalid" });
  });

  it("rejects style text containing control characters", () => {
    expect(
      suggestionsOf(rawResult({ style: { value: "Chino\u0000", confidence: "high" } }))
        .suggestions.style,
    ).toEqual({ status: "invalid" });
  });

  it("treats a malformed field entry as invalid", () => {
    expect(suggestionsOf(rawResult({ color: "Navy" })).suggestions.color).toEqual({
      status: "invalid",
    });
  });

  it("fails when the image isn't clothing, discarding any attributes", () => {
    expect(normalizeClassification(rawResult({ isClothing: false }))).toEqual({
      status: "failed",
      reason: "not_clothing",
    });
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "Top"],
    ["a number", 42],
    ["an array", []],
    ["a non-boolean isClothing", rawResult({ isClothing: "yes" })],
    ["an empty object", {}],
  ])("fails with invalid_output for %s", (_label, raw) => {
    expect(normalizeClassification(raw)).toEqual({ status: "failed", reason: "invalid_output" });
  });

  it("ignores extra provider fields", () => {
    const result = suggestionsOf({ ...rawResult(), owner: "someone-else", price: 10 });
    expect(Object.keys(result.suggestions)).toEqual([
      "category",
      "color",
      "style",
      "season",
      "formality",
    ]);
  });

  it("uses the same style limit as the WardrobeItem model", () => {
    expect(WardrobeItem.schema.path("style").options.maxlength).toBe(STYLE_MAX_LENGTH);
  });
});
