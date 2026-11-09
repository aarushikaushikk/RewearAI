// The entry point page code uses: one lazily created classifier per tab, backed by the model
// worker. Returns null where the model can't run (no Worker or WebAssembly, or on the server),
// so classifyClothingImage reports "unavailable" and the review form offers manual entry.

import { createBrowserClassifier, type WorkerClassifier } from "./createWorkerClassifier";

let classifier: WorkerClassifier | null | undefined;

export function getBrowserClassifier(): WorkerClassifier | null {
  if (classifier === undefined) {
    classifier = createBrowserClassifier(
      () => new Worker(new URL("./classifier.worker.ts", import.meta.url), { type: "module" }),
    );
  }
  return classifier;
}
