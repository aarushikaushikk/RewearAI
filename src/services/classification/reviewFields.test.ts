import { describe, expect, it } from "vitest";
import type { ClassificationSuggestions } from "@/types/classification";
import {
  applySuggestions,
  confirmSuggestion,
  editReviewField,
  emptyReviewFields,
  fieldValues,
  hasAppliedSuggestions,
  hasUnreviewed,
  needsConfirmation,
  reviewErrors,
  reviewHint,
} from "./reviewFields";
import { interpretZeroShotScores } from "./interpretZeroShotScores";
import { normalizeClassification } from "./normalizeClassification";

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

  it("makes a confirmed uncertain value unreviewed again when the user unticks it", () => {
    const confirmed = confirmSuggestion(applySuggestions(emptyReviewFields(), SUGGESTIONS), "color", true);
    const unticked = confirmSuggestion(confirmed, "color", false);

    expect(reviewErrors(unticked)).toEqual({ color: "Confirm or change this value." });
    expect(hasUnreviewed(unticked)).toBe(true);
    expect(needsConfirmation(unticked.color)).toBe(true);
    expect(reviewHint(unticked.color)).toBe("Needs review. Confirm or change this suggestion.");
  });

  it("counts choosing a different value for an uncertain suggestion as reviewing it", () => {
    const changed = editReviewField(applySuggestions(emptyReviewFields(), SUGGESTIONS), "color", "Pink");
    expect(changed.color).toMatchObject({ value: "Pink", reviewed: true });
    expect(hasUnreviewed(changed)).toBe(false);
  });

  describe("when a retried analysis returns new suggestions", () => {
    const RETRY: ClassificationSuggestions = {
      category: { status: "uncertain", value: "Outerwear" },
      color: { status: "suggested", value: "Black" },
      style: { status: "uncertain", value: "Jacket" },
      season: { status: "suggested", value: "Winter" },
      formality: { status: "suggested", value: "Formal" },
    };

    it("keeps a value the user confirmed, and keeps it reviewed", () => {
      const confirmed = confirmSuggestion(applySuggestions(emptyReviewFields(), SUGGESTIONS), "color", true);
      const retried = applySuggestions(confirmed, RETRY);
      expect(retried.color).toMatchObject({ value: "Red", reviewed: true });
      expect(reviewErrors(retried).color).toBeUndefined();
    });

    it("keeps an uncertain value the user unticked still unreviewed, instead of accepting it", () => {
      const confirmed = confirmSuggestion(applySuggestions(emptyReviewFields(), SUGGESTIONS), "color", true);
      const unticked = confirmSuggestion(confirmed, "color", false);
      const retried = applySuggestions(unticked, RETRY);

      expect(retried.color.value).toBe("Red");
      // Category and style are untouched, so they take the retry's uncertain values.
      expect(reviewErrors(retried)).toEqual({
        category: "Confirm or change this value.",
        color: "Confirm or change this value.",
        style: "Confirm or change this value.",
      });
      expect(needsConfirmation(retried.color)).toBe(true);
    });

    it("keeps an uncertain value the user changed back to the suggestion still unreviewed", () => {
      const fields = applySuggestions(emptyReviewFields(), SUGGESTIONS);
      const back = editReviewField(editReviewField(fields, "color", "Pink"), "color", "Red");
      const retried = applySuggestions(back, RETRY);

      expect(retried.color.value).toBe("Red");
      expect(reviewErrors(retried).color).toBe("Confirm or change this value.");
    });

    it("keeps values the user edited, and fills only the untouched fields", () => {
      let fields = applySuggestions(emptyReviewFields(), SUGGESTIONS);
      fields = editReviewField(fields, "style", "Polo");
      fields = editReviewField(fields, "season", "Summer");
      const retried = applySuggestions(fields, RETRY);

      expect(fieldValues(retried)).toEqual({
        category: "Outerwear",
        color: "Black",
        style: "Polo",
        season: "Summer",
        formality: "Formal",
      });
      expect(retried.style.reviewed).toBe(true);
      expect(retried.season.reviewed).toBe(true);
    });
  });

  it("blocks saving a conflicting category from real scores until the user reviews it", () => {
    const result = normalizeClassification(
      interpretZeroShotScores([
        { label: "a photo of a jacket", score: 0.3 },
        { label: "a photo of a blazer", score: 0.05 },
        { label: "a photo of a t-shirt", score: 0.17 },
        { label: "a photo of a button-down shirt", score: 0.16 },
        { label: "a photo of a sweater", score: 0.16 },
        { label: "a photo of a hoodie", score: 0.16 },
        { label: "a photo of a black clothing item", score: 0.9 },
      ]),
    );
    if (result.status !== "ok") throw new Error("expected suggestions");
    expect(result.fieldsNeedingReview).toContain("category");

    const fields = applySuggestions(emptyReviewFields(), result.suggestions);
    expect(fields.category).toMatchObject({ value: "Top", status: "uncertain" });
    expect(reviewErrors(fields).category).toBe("Confirm or change this value.");

    const confirmed = confirmSuggestion(fields, "category", true);
    expect(reviewErrors(confirmed).category).toBeUndefined();
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
