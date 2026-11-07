// Main-thread side of in-browser classification: implements ZeroShotImageClassifier by sending
// requests to a Web Worker that runs the model. Any rejection here makes classifyClothingImage
// return "unavailable", which offers manual entry.

import type { LabelScore, ZeroShotImageClassifier } from "@/types/classification";
import { isWorkerResponse, type ClassifyRequest, type WorkerErrorCode } from "./workerProtocol";

/** The parts of a Web Worker this adapter uses; tests pass a fake. */
export interface WorkerLike {
  postMessage(message: ClassifyRequest): void;
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  addEventListener(type: "error" | "messageerror", listener: (event: Event) => void): void;
  terminate(): void;
}

export type WorkerClassifierErrorCode =
  | WorkerErrorCode
  | "unavailable"
  | "timeout"
  | "crashed"
  | "invalid_response"
  | "disposed";

/** Carries a code for diagnostics; never shown to users. */
export class WorkerClassifierError extends Error {
  constructor(readonly code: WorkerClassifierErrorCode) {
    super(`Classification worker failed: ${code}`);
    this.name = "WorkerClassifierError";
  }
}

export interface WorkerClassifierOptions {
  createWorker: () => WorkerLike;
  /** Per-request limit once the model has answered at least once. */
  timeoutMs?: number;
  /** Limit until a worker first answers, covering the one-time model download. */
  initialTimeoutMs?: number;
}

export type WorkerClassifier = ZeroShotImageClassifier & { dispose(): void };

/** Starting values; revisit after timing the real model on slow connections. */
export const DEFAULT_TIMEOUT_MS = 60_000;
export const DEFAULT_INITIAL_TIMEOUT_MS = 300_000;

interface Pending {
  resolve: (scores: LabelScore[]) => void;
  reject: (error: WorkerClassifierError) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function createWorkerClassifier({
  createWorker,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  initialTimeoutMs = DEFAULT_INITIAL_TIMEOUT_MS,
}: WorkerClassifierOptions): WorkerClassifier {
  let worker: WorkerLike | null = null;
  let modelReady = false;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  function settle(id: number): Pending | undefined {
    const request = pending.get(id);
    if (request) {
      clearTimeout(request.timer);
      pending.delete(id);
    }
    return request;
  }

  /** Stops the current worker and fails everything waiting on it; the next call starts fresh. */
  function shutDown(code: WorkerClassifierErrorCode) {
    worker?.terminate();
    worker = null;
    modelReady = false;
    for (const id of [...pending.keys()]) settle(id)?.reject(new WorkerClassifierError(code));
  }

  function handleMessage(current: WorkerLike, data: unknown) {
    if (current !== worker) return; // A message from a worker that was already replaced.

    if (!isWorkerResponse(data)) {
      const id = typeof data === "object" && data !== null ? (data as { id?: unknown }).id : null;
      if (typeof id === "number") settle(id)?.reject(new WorkerClassifierError("invalid_response"));
      return; // Anything else (for example progress messages) is ignored.
    }

    const request = settle(data.id);
    if (!request) return; // Late reply to a request that already timed out.
    if (data.type === "result") {
      modelReady = true;
      request.resolve(data.scores);
    } else {
      request.reject(new WorkerClassifierError(data.code));
    }
  }

  function startWorker(): WorkerLike {
    const created = createWorker();
    created.addEventListener("message", (event) => handleMessage(created, event.data));
    const onCrash = () => {
      if (created === worker) shutDown("crashed");
    };
    created.addEventListener("error", onCrash);
    created.addEventListener("messageerror", onCrash);
    return created;
  }

  const classify: ZeroShotImageClassifier = (image, labels) =>
    new Promise<LabelScore[]>((resolve, reject) => {
      try {
        worker ??= startWorker();
      } catch {
        reject(new WorkerClassifierError("unavailable"));
        return;
      }

      const id = nextId++;
      const timer = setTimeout(
        () => {
          if (pending.has(id)) shutDown("timeout");
        },
        modelReady ? timeoutMs : initialTimeoutMs,
      );
      pending.set(id, { resolve, reject, timer });
      try {
        worker.postMessage({ type: "classify", id, image, labels });
      } catch {
        // For example a DataCloneError; the worker itself is still usable.
        settle(id)?.reject(new WorkerClassifierError("unavailable"));
      }
    });

  return Object.assign(classify, { dispose: () => shutDown("disposed") });
}

interface BrowserScope {
  Worker?: unknown;
  WebAssembly?: unknown;
}

/** Returns null where the browser can't run the model, so callers go straight to manual entry. */
export function createBrowserClassifier(
  createWorker: () => WorkerLike,
  options: Omit<WorkerClassifierOptions, "createWorker"> = {},
  scope: BrowserScope = globalThis,
): WorkerClassifier | null {
  if (typeof scope.Worker === "undefined" || typeof scope.WebAssembly === "undefined") {
    return null;
  }
  return createWorkerClassifier({ createWorker, ...options });
}
