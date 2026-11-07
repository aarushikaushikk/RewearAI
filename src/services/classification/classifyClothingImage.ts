import type {
  ClassifiableImage,
  ClassificationResult,
  ZeroShotImageClassifier,
} from "@/types/classification";
import { ALL_PROMPTS } from "./clothingLabels";
import { interpretZeroShotScores } from "./interpretZeroShotScores";
import { normalizeClassification } from "./normalizeClassification";

/**
 * The entry point US2 calls after the user selects an image. Client-safe: no server imports,
 * no network calls of its own, and no database writes. Pass `null` when no classifier could be
 * loaded; every failure result means "offer manual entry".
 */
export async function classifyClothingImage(
  image: ClassifiableImage,
  classifier: ZeroShotImageClassifier | null,
): Promise<ClassificationResult> {
  if (!classifier) return { status: "failed", reason: "unavailable" };

  let scores: unknown;
  try {
    scores = await classifier(image, ALL_PROMPTS);
  } catch {
    return { status: "failed", reason: "unavailable" };
  }

  if (!Array.isArray(scores)) return { status: "failed", reason: "invalid_output" };
  return normalizeClassification(interpretZeroShotScores(scores));
}
