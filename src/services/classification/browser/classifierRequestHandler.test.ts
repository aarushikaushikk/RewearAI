import { describe, expect, it, vi } from "vitest";
import {
  createClassifierRequestHandler,
  MAX_LABEL_SETS,
  type ZeroShotEmbeddingModel,
} from "./classifierRequestHandler";

// Synthetic embeddings stand in for the real model; they are never used outside tests.
const labels = ["a photo of a hat", "a photo of food"];
const image = new Blob(["fake image bytes"], { type: "image/png" });
const request = (id: number) => ({ type: "classify", id, image, labels });

function fakeModel(overrides: Partial<ZeroShotEmbeddingModel> = {}): ZeroShotEmbeddingModel {
  return {
    embedTexts: vi.fn(async (texts: readonly string[]) => texts.map((_, i) => (i === 0 ? [1, 0] : [0, 1]))),
    embedImage: vi.fn(async () => [0.9, 0.1]),
    ...overrides,
  };
}

describe("createClassifierRequestHandler", () => {
  it("scores the image against the labels and answers with the request's ID", async () => {
    const handle = createClassifierRequestHandler(async () => fakeModel());
    const response = await handle(request(7));

    expect(response).toMatchObject({ type: "result", id: 7 });
    if (response?.type !== "result") throw new Error("expected a result");
    expect(response.scores.map((s) => s.label)).toEqual(labels);
    expect(response.scores[0].score).toBeGreaterThan(0.99);
  });

  it("loads the model once and embeds the same labels only once", async () => {
    const model = fakeModel();
    const load = vi.fn(async () => model);
    const handle = createClassifierRequestHandler(load);

    await handle(request(1));
    await handle(request(2));

    expect(load).toHaveBeenCalledOnce();
    expect(model.embedTexts).toHaveBeenCalledOnce();
    expect(model.embedImage).toHaveBeenCalledTimes(2);
  });

  it("embeds the labels again when a request uses different labels", async () => {
    const model = fakeModel();
    const handle = createClassifierRequestHandler(async () => model);
    await handle(request(1));
    await handle({ ...request(2), labels: ["a photo of a coat", "a photo of food"] });
    expect(model.embedTexts).toHaveBeenCalledTimes(2);
  });

  it("keeps several label sets, so switching back to one doesn't embed it again (US13)", async () => {
    const model = fakeModel();
    const handle = createClassifierRequestHandler(async () => model);
    const other = ["a photo of a coat", "a photo of food"];

    await handle(request(1));
    await handle({ ...request(2), labels: other });
    await handle(request(3));
    await handle({ ...request(4), labels: other });

    expect(model.embedTexts).toHaveBeenCalledTimes(2);
  });

  it("forgets the least recently used label set beyond the limit", async () => {
    const model = fakeModel();
    const handle = createClassifierRequestHandler(async () => model);
    const sets = Array.from({ length: MAX_LABEL_SETS + 1 }, (_, i) => [`label ${i}`, "a photo of food"]);

    for (const [i, set] of sets.entries()) await handle({ ...request(i), labels: set });
    await handle({ ...request(99), labels: sets[0] });

    expect(model.embedTexts).toHaveBeenCalledTimes(MAX_LABEL_SETS + 2);
  });

  it("runs requests one at a time, in order", async () => {
    let releaseFirst = () => {};
    const gate = new Promise<void>((resolve) => (releaseFirst = resolve));
    const started: number[] = [];
    const model = fakeModel({
      embedImage: vi.fn(async () => {
        started.push(started.length + 1);
        if (started.length === 1) await gate;
        return [0.9, 0.1];
      }),
    });
    const handle = createClassifierRequestHandler(async () => model);

    const first = handle(request(1));
    const second = handle(request(2));
    await vi.waitFor(() => expect(started).toEqual([1]));
    await new Promise((r) => setTimeout(r, 10));
    expect(started).toEqual([1]); // The second request hasn't started while the first runs.

    releaseFirst();
    await expect(first).resolves.toMatchObject({ id: 1 });
    await expect(second).resolves.toMatchObject({ id: 2 });
  });

  it("answers load_failed when the model can't load, and retries loading next time", async () => {
    const load = vi
      .fn<() => Promise<ZeroShotEmbeddingModel>>()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(fakeModel());
    const handle = createClassifierRequestHandler(load);

    await expect(handle(request(1))).resolves.toEqual({ type: "error", id: 1, code: "load_failed" });
    await expect(handle(request(2))).resolves.toMatchObject({ type: "result", id: 2 });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("answers inference_failed, without error details, when scoring fails", async () => {
    const handle = createClassifierRequestHandler(async () =>
      fakeModel({
        embedImage: async () => {
          throw new RangeError("WebAssembly.Memory(): could not allocate memory");
        },
      }),
    );
    await expect(handle(request(3))).resolves.toEqual({
      type: "error",
      id: 3,
      code: "inference_failed",
    });
  });

  it("answers inference_failed when the model returns unusable embeddings", async () => {
    const handle = createClassifierRequestHandler(async () =>
      fakeModel({ embedImage: async () => [Number.NaN, 1] }),
    );
    await expect(handle(request(4))).resolves.toMatchObject({ code: "inference_failed" });
  });

  it("answers inference_failed for a malformed request that has an ID, and ignores one without", async () => {
    const load = vi.fn(async () => fakeModel());
    const handle = createClassifierRequestHandler(load);
    await expect(handle({ type: "classify", id: 5, labels: [] })).resolves.toEqual({
      type: "error",
      id: 5,
      code: "inference_failed",
    });
    await expect(handle({ hello: "world" })).resolves.toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
});
