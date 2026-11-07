import { describe, expect, it } from "vitest";
import { isWorkerResponse } from "./workerProtocol";

describe("isWorkerResponse", () => {
  it.each([
    ["a result", { type: "result", id: 1, scores: [{ label: "a photo of a hat", score: 0.9 }] }],
    ["an empty result", { type: "result", id: 2, scores: [] }],
    ["a load error", { type: "error", id: 3, code: "load_failed" }],
    ["an inference error", { type: "error", id: 4, code: "inference_failed" }],
  ])("accepts %s", (_label, message) => {
    expect(isWorkerResponse(message)).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "result"],
    ["an unknown type", { type: "progress", id: 1 }],
    ["a missing id", { type: "result", scores: [] }],
    ["a non-integer id", { type: "result", id: 1.5, scores: [] }],
    ["scores that aren't a list", { type: "result", id: 1, scores: {} }],
    ["a non-numeric score", { type: "result", id: 1, scores: [{ label: "x", score: "0.9" }] }],
    ["a NaN score", { type: "result", id: 1, scores: [{ label: "x", score: Number.NaN }] }],
    ["a missing label", { type: "result", id: 1, scores: [{ score: 0.9 }] }],
    ["an unknown error code", { type: "error", id: 1, code: "boom" }],
  ])("rejects %s", (_label, message) => {
    expect(isWorkerResponse(message)).toBe(false);
  });
});
