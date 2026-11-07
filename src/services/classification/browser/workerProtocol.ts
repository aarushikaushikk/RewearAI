// Messages between the page and the classification Web Worker. Everything the worker sends is
// checked with `isWorkerResponse` before use, because a worker can misbehave or be replaced.

import type { ClassifiableImage, LabelScore } from "@/types/classification";

/**
 * - `load_failed`: the model or runtime couldn't be downloaded or started.
 * - `inference_failed`: the model loaded, but scoring this image failed.
 */
export const WORKER_ERROR_CODES = ["load_failed", "inference_failed"] as const;
export type WorkerErrorCode = (typeof WORKER_ERROR_CODES)[number];

/** Page to worker. `image` is a Blob or URL, both of which survive `postMessage`. */
export interface ClassifyRequest {
  type: "classify";
  id: number;
  image: ClassifiableImage;
  labels: readonly string[];
}

/** Worker to page; `id` echoes the request it answers. */
export type WorkerResponse =
  | { type: "result"; id: number; scores: LabelScore[] }
  | { type: "error"; id: number; code: WorkerErrorCode };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLabelScore(value: unknown): value is LabelScore {
  return isRecord(value) && typeof value.label === "string" && Number.isFinite(value.score);
}

export function isWorkerResponse(value: unknown): value is WorkerResponse {
  if (!isRecord(value) || !Number.isInteger(value.id)) return false;
  if (value.type === "result") {
    return Array.isArray(value.scores) && value.scores.every(isLabelScore);
  }
  if (value.type === "error") {
    return (WORKER_ERROR_CODES as readonly unknown[]).includes(value.code);
  }
  return false;
}
