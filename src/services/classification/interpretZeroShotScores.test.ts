import { describe, expect, it } from "vitest";
import type { LabelScore } from "@/types/classification";
import { CATEGORIES, COLORS, FORMALITIES, SEASONS } from "@/types/wardrobe";
import {
  ALL_PROMPTS,
  COLOR_PROMPTS,
  FORMALITY_PROMPTS,
  GARMENT_PROMPTS,
  SEASON_PROMPTS,
} from "./clothingLabels";
import { interpretZeroShotScores } from "./interpretZeroShotScores";

/** Gives the named prompts their scores and spreads `rest` evenly over every other prompt. */
function scores(chosen: Record<string, number>, rest = 0): LabelScore[] {
  const others = ALL_PROMPTS.filter((p) => !(p in chosen));
  return [
    ...Object.entries(chosen).map(([label, score]) => ({ label, score })),
    ...others.map((label) => ({ label, score: rest / others.length })),
  ];
}

const JEANS = "a photo of a pair of jeans";
const TROUSERS = "a photo of a pair of trousers";
const TSHIRT = "a photo of a t-shirt";
const NAVY = "a photo of a navy blue clothing item";
const BLACK = "a photo of a black clothing item";
const WINTER = "a photo of warm clothing for cold winter weather";
const CASUAL = "a photo of casual everyday clothing";
const FACE = "a photo of a person's face";

describe("clothing prompt tables", () => {
  it("has unique prompts so one model call can be split by group", () => {
    expect(new Set(ALL_PROMPTS).size).toBe(ALL_PROMPTS.length);
  });

  it("covers every allowed category, color, season, and formality", () => {
    expect(new Set(GARMENT_PROMPTS.map((g) => g.category))).toEqual(new Set(CATEGORIES));
    expect(new Set(COLOR_PROMPTS.values())).toEqual(new Set(COLORS));
    expect(new Set(SEASON_PROMPTS.values())).toEqual(new Set(SEASONS));
    expect(new Set(FORMALITY_PROMPTS.values())).toEqual(new Set(FORMALITIES));
  });
});

describe("interpretZeroShotScores", () => {
  it("reports clear winners with high confidence for category, style, and color", () => {
    const raw = interpretZeroShotScores(
      scores({ [JEANS]: 0.3, [NAVY]: 0.3, [WINTER]: 0.1, [CASUAL]: 0.1 }, 0.2),
    );
    expect(raw.isClothing).toBe(true);
    expect(raw.category).toEqual({ value: "Bottom", confidence: "high" });
    expect(raw.style).toEqual({ value: "Jeans", confidence: "high" });
    expect(raw.color).toEqual({ value: "Navy", confidence: "high" });
  });

  it("adds garment scores by category, while style stays uncertain if garments are close", () => {
    const raw = interpretZeroShotScores(scores({ [JEANS]: 0.2, [TROUSERS]: 0.2, [NAVY]: 0.3 }, 0.3));
    expect(raw.category).toEqual({ value: "Bottom", confidence: "high" });
    expect(raw.style?.confidence).toBe("low");
  });

  it("marks a close race as low confidence but still reports the leader", () => {
    const raw = interpretZeroShotScores(scores({ [TSHIRT]: 0.3, [NAVY]: 0.12, [BLACK]: 0.11 }, 0.47));
    expect(raw.color).toEqual({ value: "Navy", confidence: "low" });
  });

  it("never reports season or formality with high confidence", () => {
    const raw = interpretZeroShotScores(scores({ [JEANS]: 0.3, [WINTER]: 0.3, [CASUAL]: 0.3 }, 0.1));
    expect(raw.season).toEqual({ value: "Winter", confidence: "low" });
    expect(raw.formality).toEqual({ value: "Casual", confidence: "low" });
  });

  it("says the image isn't clothing when non-clothing prompts outscore garments", () => {
    expect(interpretZeroShotScores(scores({ [FACE]: 0.6 }, 0.4)).isClothing).toBe(false);
  });

  it("leaves out fields the model returned no scores for, instead of filling them in", () => {
    const raw = interpretZeroShotScores([{ label: JEANS, score: 0.9 }]);
    expect(raw.category).toEqual({ value: "Bottom", confidence: "high" });
    expect(raw.color).toBeUndefined();
    expect(raw.season).toBeUndefined();
    expect(raw.formality).toBeUndefined();
  });

  it("ignores unknown labels and unusable scores", () => {
    const raw = interpretZeroShotScores([
      { label: "a photo of a spaceship", score: 0.9 },
      { label: NAVY, score: Number.NaN },
      { label: BLACK, score: -1 },
      { label: JEANS, score: 0.1 },
    ]);
    expect(raw.category).toEqual({ value: "Bottom", confidence: "high" });
    expect(raw.color).toBeUndefined();
  });

  it("gives no clothing verdict when there are no usable garment scores", () => {
    expect(interpretZeroShotScores([]).isClothing).toBeUndefined();
  });
});
