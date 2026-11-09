// Worker-side request handling, kept free of Transformers.js so it can be tested with a fake
// model. classifier.worker.ts passes in the real model loader.

import type { ClassifiableImage } from "@/types/classification";
import { scoreLabels, type Embedding } from "../zeroShotScoring";
import { isClassifyRequest, type ClassifyRequest, type WorkerResponse } from "./workerProtocol";

/** What the worker needs from an image-text model such as FashionSigLIP. */
export interface ZeroShotEmbeddingModel {
  /** One embedding per label, in order. */
  embedTexts(labels: readonly string[]): Promise<Embedding[]>;
  embedImage(image: ClassifiableImage): Promise<Embedding>;
}

/**
 * Returns a handler for messages arriving in the worker. It loads the model on first use and
 * keeps it; a failed load is forgotten so the next request tries again. Label embeddings are
 * cached for the most recent label list, which in practice never changes. Requests run one at a
 * time, because a model session shouldn't run concurrent inferences.
 * Responses carry only an error code, never error details.
 */
export function createClassifierRequestHandler(
  loadModel: () => Promise<ZeroShotEmbeddingModel>,
): (message: unknown) => Promise<WorkerResponse | null> {
  let model: Promise<ZeroShotEmbeddingModel> | null = null;
  let labelCache: { key: string; embeddings: Embedding[] } | null = null;
  let queue: Promise<unknown> = Promise.resolve();

  function getModel() {
    model ??= loadModel().catch((error: unknown) => {
      model = null;
      throw error;
    });
    return model;
  }

  async function labelEmbeddings(loaded: ZeroShotEmbeddingModel, labels: readonly string[]) {
    const key = JSON.stringify(labels);
    if (labelCache?.key !== key) {
      labelCache = { key, embeddings: await loaded.embedTexts(labels) };
    }
    return labelCache.embeddings;
  }

  async function classify({ id, image, labels }: ClassifyRequest): Promise<WorkerResponse> {
    let loaded: ZeroShotEmbeddingModel;
    try {
      loaded = await getModel();
    } catch {
      return { type: "error", id, code: "load_failed" };
    }
    try {
      const texts = await labelEmbeddings(loaded, labels);
      const scores = scoreLabels(await loaded.embedImage(image), texts, labels);
      return { type: "result", id, scores };
    } catch {
      return { type: "error", id, code: "inference_failed" };
    }
  }

  return async (message) => {
    if (!isClassifyRequest(message)) {
      const id = typeof message === "object" && message !== null ? (message as { id?: unknown }).id : null;
      return Number.isInteger(id) ? { type: "error", id: id as number, code: "inference_failed" } : null;
    }
    const result = queue.then(() => classify(message));
    queue = result;
    return result;
  };
}
