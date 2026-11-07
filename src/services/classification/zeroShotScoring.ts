// Turns model embeddings into zero-shot label scores: softmax over scaled cosine similarity,
// as in FashionSigLIP's and CLIP's published examples. Pure; used inside the model worker.

import type { LabelScore } from "@/types/classification";

/** Model embeddings arrive as plain arrays or typed arrays such as Float32Array. */
export type Embedding = ArrayLike<number>;

/** Multiplier applied to cosine similarity before softmax, from the models' examples. */
export const DEFAULT_LOGIT_SCALE = 100;

function assertFinite(values: ArrayLike<number>, what: string) {
  for (let i = 0; i < values.length; i += 1) {
    if (!Number.isFinite(values[i])) throw new Error(`${what} must contain only finite numbers.`);
  }
}

export function cosineSimilarity(a: Embedding, b: Embedding): number {
  if (a.length !== b.length) throw new Error("Embeddings must have the same length.");
  if (a.length === 0) throw new Error("Embeddings must not be empty.");
  assertFinite(a, "Embeddings");
  assertFinite(b, "Embeddings");

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) throw new Error("Cannot compare a zero vector.");
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Numerically stable: subtracts the largest logit before exponentiating. */
export function softmax(logits: readonly number[]): number[] {
  if (logits.length === 0) throw new Error("Logits must not be empty.");
  assertFinite(logits, "Logits");

  const max = Math.max(...logits);
  const exps = logits.map((x) => Math.exp(x - max));
  const total = exps.reduce((sum, x) => sum + x, 0);
  return exps.map((x) => x / total);
}

/**
 * Scores each label against the image. Scores follow `labels` order and sum to 1, which is
 * what `interpretZeroShotScores` expects from a ZeroShotImageClassifier.
 */
export function scoreLabels(
  imageEmbedding: Embedding,
  labelEmbeddings: readonly Embedding[],
  labels: readonly string[],
  logitScale: number = DEFAULT_LOGIT_SCALE,
): LabelScore[] {
  if (labels.length !== labelEmbeddings.length) {
    throw new Error("Each label needs exactly one embedding.");
  }
  if (!Number.isFinite(logitScale) || logitScale <= 0) {
    throw new Error("The logit scale must be a positive, finite number.");
  }

  const logits = labelEmbeddings.map((e) => logitScale * cosineSimilarity(imageEmbedding, e));
  return softmax(logits).map((score, i) => ({ label: labels[i], score }));
}
