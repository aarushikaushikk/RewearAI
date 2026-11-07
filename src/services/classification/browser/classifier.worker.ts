// Web Worker that runs Marqo-FashionSigLIP off the main thread. The image never leaves the
// browser: only the model files are downloaded (from Hugging Face, then cached by the browser).
// All logic lives in classifierRequestHandler.ts, which is unit tested with a fake model.

import { createClassifierRequestHandler } from "./classifierRequestHandler";
import { loadFashionSigLip } from "./fashionSigLipModel";

interface WorkerScope {
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  postMessage(message: unknown): void;
}

const scope = self as unknown as WorkerScope;
const handle = createClassifierRequestHandler(loadFashionSigLip);

scope.addEventListener("message", (event) => {
  void handle(event.data).then((response) => {
    if (response) scope.postMessage(response);
  });
});
