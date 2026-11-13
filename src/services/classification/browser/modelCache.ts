// US13: whether the FashionSigLIP files US3 downloads are already in this browser's cache, so
// Create Outfit can use the model without starting a ~205 MB download (LLD #18 D2a).
// Transformers.js caches model files with the Cache API under this name.

import { FASHION_SIGLIP_MODEL_ID } from "./modelId";

const TRANSFORMERS_CACHE = "transformers-cache";
const REQUIRED_FILES = [/\/onnx\/text_model[^/]*\.onnx$/, /\/onnx\/vision_model[^/]*\.onnx$/];

/** False whenever it can't tell: no Cache API, blocked storage, or a partial download. */
export async function isClassifierModelCached(): Promise<boolean> {
  try {
    if (typeof caches === "undefined" || !caches) return false;
    const cache = await caches.open(TRANSFORMERS_CACHE);
    const urls = (await cache.keys())
      .map((request) => request.url)
      .filter((url) => url.includes(`/${FASHION_SIGLIP_MODEL_ID}/`));
    return REQUIRED_FILES.every((file) => urls.some((url) => file.test(url)));
  } catch {
    return false;
  }
}
