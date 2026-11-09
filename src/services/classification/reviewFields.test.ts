import { describe, expect, it } from "vitest";
import type { ClassificationSuggestions } from "@/types/classification";
import {
  applySuggestions,
  confirmSuggestion,
  editReviewField,
  emptyReviewFields,
  fieldValues,
  hasAppliedSuggestions,
  needsConfirmation,
  reviewErrors,
  reviewHint,
} from "./reviewFields";

const SUGGESTIONS: ClassificationSuggestions = {
  category: { status: "suggested", value: "Top" },
  color: { status: "uncertain", value: "Red" },
  style: { status: "suggested", value: "T-shirt" },
  season: { status: "missing" },
  formality: { status: "invalid" },
};

describe("review fields", () => {
  it("starts empty, with nothing suggested and nothing to review", () => {
    const fields = emptyReviewFields();
    expect(fieldValues(fields)).toEqual({ category: "", color: "", style: "", season: "", formality: "" });
    expect(reviewErrors(fields)).toEqual({});
    expect(reviewHint(fields.category)).toBeUndefined();
  });

  it("fills values only from suggested and uncertain fields, inventing nothing", () => {
    const fields = applySuggestions(emptyReviewFields(), SUGGESTIONS);
    expect(fieldValues(fields)).toEqual({
      category: "Top",
      color: "Red",
      style: "T-shirt",
      season: "",
      formality: "",
    });
    expect(reviewHint(fields.category)).toBe("Suggested from your photo.");
    expect(reviewHint(fields.color)).toBe("Needs review. Confirm or change this suggestion.");
    expect(reviewHint(fields.season)).toBe("Not detected in your photo.");
    expect(reviewHint(fields.formality)).toBe("The suggestion couldn't be used.");
  });

  it("never overwrites a field the user has edited", () => {
    let fields = editReviewField(emptyReviewFields(), "category", "Shoes");
    fields = editReviewField(fields, "season", "");
    fields = applySuggestions(fields, SUGGESTIONS);

    expect(fields.category).toMatchObject({ value: "Shoes", status: "manual" });
    expect(fields.season).toMatchObject({ value: "", status: "manual" });
    expect(fields.color.value).toBe("Red");
    expect(reviewHint(fields.category)).toBeUndefined();
  });

  it("reports whether any suggestion was actually applied", () => {
    expect(hasAppliedSuggestions(applySuggestions(emptyReviewFields(), SUGGESTIONS))).toBe(true);

    let allEdited = emptyReviewFields();
    for (const f of ["category", "color", "style", "season", "formality"] as const) {
      allEdited = editReviewField(allEdited, f, "x");
    }
    expect(hasAppliedSuggestions(applySuggestions(allEdited, SUGGESTIONS))).toBe(false);
  });

  it("requires an uncertain value to be confirmed or changed", () => {
    const fields = applySuggestions(emptyReviewFields(), SUGGESTIONS);
    expect(needsConfirmation(fields.color)).toBe(true);
    expect(reviewErrors(fields)).toEqual({ color: "Confirm or change this value." });

    const confirmed = confirmSuggestion(fields, "color", true);
    expect(reviewErrors(confirmed)).toEqual({});
    expect(reviewHint(confirmed.color)).toBe("Reviewed.");
    expect(confirmed.color.value).toBe("Red");
  });

  it("counts changing an uncertain value as reviewing it, and changing it back as not", () => {
    const fields = applySuggestions(emptyReviewFields(), SUGGESTIONS);
    const changed = editReviewField(fields, "color", "Burgundy");
    expect(reviewErrors(changed)).toEqual({});
    expect(needsConfirmation(changed.color)).toBe(false);
    expect(reviewHint(changed.color)).toBeUndefined();

    const back = editReviewField(changed, "color", "Red");
    expect(reviewErrors(back)).toEqual({ color: "Confirm or change this value." });
  });

  it("drops the suggestion label once the user changes a suggested value", () => {
    const fields = editReviewField(applySuggestions(emptyReviewFields(), SUGGESTIONS), "style", "Polo");
    expect(fields.style.value).toBe("Polo");
    expect(reviewHint(fields.style)).toBeUndefined();
  });

  it("replaces earlier suggestions the user hasn't touched when new ones arrive", () => {
    const first = applySuggestions(emptyReviewFields(), SUGGESTIONS);
    const second = applySuggestions(first, {
      ...SUGGESTIONS,
      category: { status: "uncertain", value: "Outerwear" },
    });
    expect(second.category).toMatchObject({ value: "Outerwear", status: "uncertain", reviewed: false });
  });
});
