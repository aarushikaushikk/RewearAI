import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { LabelScore, ZeroShotImageClassifier } from "@/types/classification";
import { classifyClothingImage } from "../classifyClothingImage";
import {
  createBrowserClassifier,
  createWorkerClassifier,
  WorkerClassifierError,
  type WorkerLike,
} from "./createWorkerClassifier";
import type { ClassifyRequest } from "./workerProtocol";

/** In-memory stand-in for a Web Worker; tests play the worker's side by hand. */
class FakeWorker implements WorkerLike {
  posted: ClassifyRequest[] = [];
  terminated = false;
  private listeners: Record<string, ((event: never) => void)[]> = {};

  postMessage(message: ClassifyRequest) {
    this.posted.push(message);
  }
  addEventListener(type: string, listener: (event: never) => void) {
    (this.listeners[type] ??= []).push(listener);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: unknown) {
    for (const l of this.listeners.message ?? []) l({ data } as never);
  }
  crash() {
    for (const l of this.listeners.error ?? []) l(new Event("error") as never);
  }
  get lastId() {
    return this.posted.at(-1)!.id;
  }
}

const image = new Blob(["fake image bytes"], { type: "image/jpeg" });
const labels = ["a photo of a hat", "a photo of food"] as const;
const scores: LabelScore[] = [
  { label: "a photo of a hat", score: 0.8 },
  { label: "a photo of food", score: 0.2 },
];

function setup(options: { timeoutMs?: number; initialTimeoutMs?: number } = {}) {
  const workers: FakeWorker[] = [];
  const createWorker = vi.fn(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  const classifier = createWorkerClassifier({ createWorker, ...options });
  return { classifier, createWorker, workers, current: () => workers.at(-1)! };
}

async function expectCode(promise: Promise<unknown>, code: WorkerClassifierError["code"]) {
  await expect(promise).rejects.toBeInstanceOf(WorkerClassifierError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe("createWorkerClassifier", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("matches the ZeroShotImageClassifier interface, and a real Worker fits WorkerLike", () => {
    expectTypeOf(setup().classifier).toExtend<ZeroShotImageClassifier>();
    expectTypeOf<Worker>().toExtend<WorkerLike>();
  });

  it("creates the worker on first use, posts the request, and resolves with its scores", async () => {
    const { classifier, createWorker, current } = setup();
    expect(createWorker).not.toHaveBeenCalled();

    const pending = classifier(image, labels);
    expect(current().posted).toEqual([{ type: "classify", id: current().lastId, image, labels }]);
    current().reply({ type: "result", id: current().lastId, scores });

    await expect(pending).resolves.toEqual(scores);
  });

  it("reuses one worker across requests", async () => {
    const { classifier, createWorker, current } = setup();
    const first = classifier(image, labels);
    current().reply({ type: "result", id: current().lastId, scores });
    await first;
    const second = classifier(image, labels);
    current().reply({ type: "result", id: current().lastId, scores });
    await second;
    expect(createWorker).toHaveBeenCalledOnce();
  });

  it("matches concurrent responses to their requests by ID, in any order", async () => {
    const { classifier, current } = setup();
    const a = classifier(image, labels);
    const b = classifier(image, labels);
    const [idA, idB] = current().posted.map((p) => p.id);
    expect(idA).not.toBe(idB);

    const scoresB = [{ label: "a photo of food", score: 1 }];
    current().reply({ type: "result", id: idB, scores: scoresB });
    current().reply({ type: "result", id: idA, scores });

    await expect(a).resolves.toEqual(scores);
    await expect(b).resolves.toEqual(scoresB);
  });

  it("rejects with the worker's error code", async () => {
    const { classifier, current } = setup();
    const pending = classifier(image, labels);
    current().reply({ type: "error", id: current().lastId, code: "load_failed" });
    await expectCode(pending, "load_failed");
  });

  it("rejects a malformed response for a pending request, and ignores unmatched messages", async () => {
    const { classifier, current } = setup();
    const a = classifier(image, labels);
    const b = classifier(image, labels);
    const [idA, idB] = current().posted.map((p) => p.id);

    current().reply({ type: "progress", loaded: 10 });
    current().reply({ type: "result", id: 999, scores });
    current().reply({ type: "result", id: idA, scores: "not a list" });
    await expectCode(a, "invalid_response");

    current().reply({ type: "result", id: idB, scores });
    await expect(b).resolves.toEqual(scores);
  });

  it("rejects every pending request when the worker crashes, then starts a new worker", async () => {
    const { classifier, createWorker, workers, current } = setup();
    const a = classifier(image, labels);
    const b = classifier(image, labels);
    current().crash();

    await expectCode(a, "crashed");
    await expectCode(b, "crashed");
    expect(workers[0].terminated).toBe(true);

    const retry = classifier(image, labels);
    expect(createWorker).toHaveBeenCalledTimes(2);
    current().reply({ type: "result", id: current().lastId, scores });
    await expect(retry).resolves.toEqual(scores);
  });

  it("allows the first request the longer model-loading timeout", async () => {
    const { classifier, current } = setup({ initialTimeoutMs: 5000, timeoutMs: 1000 });
    const pending = classifier(image, labels);
    vi.advanceTimersByTime(4999);
    current().reply({ type: "result", id: current().lastId, scores });
    await expect(pending).resolves.toEqual(scores);
  });

  it("times out a stuck request, stops the worker, and recovers on the next call", async () => {
    const { classifier, workers, current } = setup({ initialTimeoutMs: 5000, timeoutMs: 1000 });
    const first = classifier(image, labels);
    current().reply({ type: "result", id: current().lastId, scores });
    await first;

    const stuck = classifier(image, labels);
    const result = expectCode(stuck, "timeout");
    vi.advanceTimersByTime(1000);
    await result;
    expect(workers[0].terminated).toBe(true);

    // The new worker must load the model again, so it gets the loading timeout.
    const retry = classifier(image, labels);
    vi.advanceTimersByTime(4999);
    current().reply({ type: "result", id: current().lastId, scores });
    await expect(retry).resolves.toEqual(scores);
  });

  it("ignores a late response after a timeout", async () => {
    const { classifier, current } = setup({ initialTimeoutMs: 1000 });
    const pending = classifier(image, labels);
    const worker = current();
    const result = expectCode(pending, "timeout");
    vi.advanceTimersByTime(1000);
    await result;
    expect(() => worker.reply({ type: "result", id: worker.lastId, scores })).not.toThrow();
  });

  it("rejects as unavailable when the worker can't be created, and tries again next time", async () => {
    const createWorker = vi
      .fn<() => WorkerLike>()
      .mockImplementationOnce(() => {
        throw new Error("SecurityError");
      })
      .mockImplementation(() => new FakeWorker());
    const classifier = createWorkerClassifier({ createWorker });

    await expectCode(classifier(image, labels), "unavailable");
    void classifier(image, labels);
    expect(createWorker).toHaveBeenCalledTimes(2);
  });

  it("rejects as unavailable, without leaving it pending, when the request can't be sent", async () => {
    const { classifier, current } = setup({ initialTimeoutMs: 1000 });
    const first = classifier(image, labels);
    current().reply({ type: "result", id: current().lastId, scores });
    await first;

    current().postMessage = () => {
      throw new DOMException("could not be cloned", "DataCloneError");
    };
    await expectCode(classifier(image, labels), "unavailable");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("dispose stops the worker and rejects pending requests", async () => {
    const { classifier, current } = setup();
    const pending = classifier(image, labels);
    classifier.dispose();
    await expectCode(pending, "disposed");
    expect(current().terminated).toBe(true);
  });

  it("plugs into classifyClothingImage: scores become suggestions, and a crash means manual entry", async () => {
    const { classifier, current } = setup();
    const ok = classifyClothingImage(image, classifier);
    current().reply({
      type: "result",
      id: current().lastId,
      scores: [
        { label: "a photo of a pair of sneakers", score: 0.6 },
        { label: "a photo of a white clothing item", score: 0.4 },
      ],
    });
    await expect(ok).resolves.toMatchObject({
      status: "ok",
      suggestions: { category: { status: "suggested", value: "Shoes" } },
    });

    const crashed = classifyClothingImage(image, classifier);
    current().crash();
    await expect(crashed).resolves.toEqual({ status: "failed", reason: "unavailable" });
  });
});

describe("createBrowserClassifier", () => {
  const createWorker = () => new FakeWorker();

  it.each([
    ["Web Workers", { WebAssembly: {} }],
    ["WebAssembly", { Worker: class {} }],
  ])("returns null in a browser without %s", (_label, scope) => {
    expect(createBrowserClassifier(createWorker, {}, scope)).toBeNull();
  });

  it("returns a classifier when both are available", () => {
    expect(
      createBrowserClassifier(createWorker, {}, { Worker: class {}, WebAssembly: {} }),
    ).toBeTypeOf("function");
  });
});
