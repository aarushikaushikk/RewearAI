import { afterEach, describe, expect, it, vi } from "vitest";
import { isClassifierModelCached } from "./modelCache";
import { FASHION_SIGLIP_MODEL_ID } from "./modelId";

const base = `https://huggingface.co/${FASHION_SIGLIP_MODEL_ID}/resolve/main`;

function stubCaches(urls: string[] | "throws" | "missing") {
  if (urls === "missing") {
    vi.stubGlobal("caches", undefined);
    return;
  }
  vi.stubGlobal("caches", {
    open: vi.fn(async () => {
      if (urls === "throws") throw new DOMException("blocked", "SecurityError");
      return { keys: async () => urls.map((url) => new Request(url)) };
    }),
  });
}

describe("isClassifierModelCached (US13)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is true once both FashionSigLIP model files are in the browser cache", async () => {
    stubCaches([`${base}/onnx/text_model_quantized.onnx`, `${base}/onnx/vision_model_quantized.onnx`, `${base}/config.json`]);

    await expect(isClassifierModelCached()).resolves.toBe(true);
  });

  it("is false while only part of the model is cached", async () => {
    stubCaches([`${base}/onnx/text_model_quantized.onnx`, `${base}/config.json`]);

    await expect(isClassifierModelCached()).resolves.toBe(false);
  });

  it("ignores other models' files", async () => {
    stubCaches([
      "https://huggingface.co/someone/else/resolve/main/onnx/text_model_quantized.onnx",
      "https://huggingface.co/someone/else/resolve/main/onnx/vision_model_quantized.onnx",
    ]);

    await expect(isClassifierModelCached()).resolves.toBe(false);
  });

  it.each(["throws", "missing"] as const)("is false when the Cache API %s", async (mode) => {
    stubCaches(mode);

    await expect(isClassifierModelCached()).resolves.toBe(false);
  });
});
