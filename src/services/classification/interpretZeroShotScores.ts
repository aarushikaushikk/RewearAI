import type { LabelScore, RawClassification, RawFieldSuggestion } from "@/types/classification";
import {
  COLOR_PROMPTS,
  FORMALITY_PROMPTS,
  GARMENT_PROMPTS,
  NOT_CLOTHING_PROMPTS,
  SEASON_PROMPTS,
} from "./clothingLabels";

/**
 * A value counts as confident only if it holds at least this share of its group's score and
 * leads the runner-up by at least the margin. Starting values; tune them on real photos.
 */
export const CONFIDENT_MIN_SHARE = 0.6;
export const CONFIDENT_MIN_MARGIN = 0.2;

const GARMENTS = new Map(GARMENT_PROMPTS.map((g) => [g.prompt, g]));
const NOT_CLOTHING = new Set(NOT_CLOTHING_PROMPTS);

/** Adds up scores by value; returns the leader and whether it clearly won. */
function pickLeader(entries: readonly [value: string, score: number][]): RawFieldSuggestion | undefined {
  const totals = new Map<string, number>();
  for (const [value, score] of entries) totals.set(value, (totals.get(value) ?? 0) + score);

  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  if (sum <= 0) return undefined;

  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const [value, top] = ranked[0];
  const share = top / sum;
  const margin = share - (ranked[1]?.[1] ?? 0) / sum;
  const confident = share >= CONFIDENT_MIN_SHARE && margin >= CONFIDENT_MIN_MARGIN;
  return { value, confidence: confident ? "high" : "low" };
}

/** Season and formality describe how clothing is used, which a photo can't settle. */
function capAtLow(field: RawFieldSuggestion | undefined): RawFieldSuggestion | undefined {
  return field && { ...field, confidence: "low" };
}

function scoresFor<T>(usable: readonly LabelScore[], prompts: ReadonlyMap<string, T>) {
  return usable.flatMap(({ label, score }): [T, number][] => {
    const value = prompts.get(label);
    return value === undefined ? [] : [[value, score]];
  });
}

/**
 * Turns zero-shot scores into the provider-neutral raw shape that `normalizeClassification`
 * validates. Each group is judged on its own share of the scores, so one call can cover all.
 * A group with no usable scores is left out, which normalization reports as missing.
 */
export function interpretZeroShotScores(scores: readonly LabelScore[]): RawClassification {
  const usable = scores.filter((s) => Number.isFinite(s.score) && s.score > 0);

  const garmentScores = usable.flatMap(({ label, score }) => {
    const garment = GARMENTS.get(label);
    return garment ? [{ garment, score }] : [];
  });
  const garmentTotal = garmentScores.reduce((sum, g) => sum + g.score, 0);
  const notClothingTotal = usable
    .filter((s) => NOT_CLOTHING.has(s.label))
    .reduce((sum, s) => sum + s.score, 0);

  if (garmentTotal + notClothingTotal <= 0) return {};

  return {
    isClothing: garmentTotal > notClothingTotal,
    category: pickLeader(garmentScores.map((g) => [g.garment.category, g.score])),
    style: pickLeader(garmentScores.map((g) => [g.garment.style, g.score])),
    color: pickLeader(scoresFor(usable, COLOR_PROMPTS)),
    season: capAtLow(pickLeader(scoresFor(usable, SEASON_PROMPTS))),
    formality: capAtLow(pickLeader(scoresFor(usable, FORMALITY_PROMPTS))),
  };
}
