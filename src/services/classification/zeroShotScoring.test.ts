import { describe, expect, it } from "vitest";
import { cosineSimilarity, scoreLabels, softmax } from "./zeroShotScoring";

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

describe("cosineSimilarity", () => {
  it("is 1 for the same direction, 0 for orthogonal, and -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 5])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1);
  });

  it("accepts typed arrays, as model embeddings arrive", () => {
    expect(cosineSimilarity(new Float32Array([3, 4]), [3, 4])).toBeCloseTo(1);
  });

  it.each([
    ["different lengths", [1, 2], [1, 2, 3], /same length/],
    ["empty vectors", [], [], /empty/],
    ["a zero vector", [0, 0], [1, 1], /zero vector/],
    ["NaN", [1, Number.NaN], [1, 1], /finite/],
    ["Infinity", [1, 1], [Number.POSITIVE_INFINITY, 1], /finite/],
  ])("rejects %s", (_label, a, b, reason) => {
    expect(() => cosineSimilarity(a, b)).toThrow(reason);
  });
});

describe("softmax", () => {
  it("returns probabilities that sum to 1 and keep the logits' order", () => {
    const probs = softmax([1, 3, 2]);
    expect(sum(probs)).toBeCloseTo(1);
    expect(probs[1]).toBeGreaterThan(probs[2]);
    expect(probs[2]).toBeGreaterThan(probs[0]);
  });

  it("stays finite for large logits, such as 100 times a cosine similarity", () => {
    const probs = softmax([1000, 1001, 999]);
    expect(probs.every(Number.isFinite)).toBe(true);
    expect(sum(probs)).toBeCloseTo(1);
    expect(probs[1]).toBeCloseTo(Math.E / (1 + Math.E + 1 / Math.E));
  });

  it.each([
    ["an empty list", [], /empty/],
    ["NaN", [1, Number.NaN], /finite/],
    ["Infinity", [1, Number.POSITIVE_INFINITY], /finite/],
  ])("rejects %s", (_label, logits, reason) => {
    expect(() => softmax(logits)).toThrow(reason);
  });
});

describe("scoreLabels", () => {
  const labels = ["a photo of a t-shirt", "a photo of a pair of jeans", "a photo of a hat"];
  const labelEmbeddings = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  it("gives the label most similar to the image the highest score, in label order", () => {
    const scores = scoreLabels([0.1, 0.9, 0.2], labelEmbeddings, labels);
    expect(scores.map((s) => s.label)).toEqual(labels);
    expect(sum(scores.map((s) => s.score))).toBeCloseTo(1);
    expect(Math.max(...scores.map((s) => s.score))).toBe(scores[1].score);
  });

  it("sharpens scores with the logit scale", () => {
    const soft = scoreLabels([0.1, 0.9, 0.2], labelEmbeddings, labels, 1);
    const sharp = scoreLabels([0.1, 0.9, 0.2], labelEmbeddings, labels, 100);
    expect(sharp[1].score).toBeGreaterThan(soft[1].score);
  });

  it("rejects a label count that doesn't match the embeddings", () => {
    expect(() => scoreLabels([1, 0, 0], labelEmbeddings, labels.slice(0, 2))).toThrow(/label/);
  });

  it("rejects an invalid logit scale", () => {
    expect(() => scoreLabels([1, 0, 0], labelEmbeddings, labels, 0)).toThrow(/scale/);
    expect(() => scoreLabels([1, 0, 0], labelEmbeddings, labels, Number.NaN)).toThrow(/scale/);
  });
});
