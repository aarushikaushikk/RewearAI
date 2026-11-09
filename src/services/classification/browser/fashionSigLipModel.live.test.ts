// Opt-in check with the real model; skipped in normal runs because it downloads about 200 MB.
// Run: RUN_LIVE_MODEL=1 LIVE_IMAGE_DIR=<folder of photos> npx vitest run fashionSigLipModel.live
// Optional: LIVE_MODEL_CACHE_DIR=<folder> to keep the model download outside node_modules.
// Photos are read locally and never sent anywhere.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { env } from "@huggingface/transformers";
import { describe, expect, it } from "vitest";
import type { LabelScore } from "@/types/classification";
import { classifyClothingImage } from "../classifyClothingImage";
import { createClassifierRequestHandler } from "./classifierRequestHandler";
import { loadFashionSigLip } from "./fashionSigLipModel";

const imageDir = process.env.LIVE_IMAGE_DIR ?? "";

describe.skipIf(!process.env.RUN_LIVE_MODEL || !imageDir)("FashionSigLIP live model", () => {
  it("classifies real photos through the same handler the worker uses", { timeout: 600_000 }, async () => {
    if (process.env.LIVE_MODEL_CACHE_DIR) env.cacheDir = process.env.LIVE_MODEL_CACHE_DIR;
    const handle = createClassifierRequestHandler(loadFashionSigLip);
    let nextId = 1;
    const classifier = async (image: Blob | string, labels: readonly string[]) => {
      const response = await handle({ type: "classify", id: nextId++, image, labels });
      if (response?.type !== "result") throw new Error(`worker error: ${JSON.stringify(response)}`);
      return response.scores as LabelScore[];
    };

    const files = readdirSync(imageDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const bytes = readFileSync(path.join(imageDir, file));
      const type = file.endsWith(".png") ? "image/png" : "image/jpeg";
      const started = performance.now();
      const result = await classifyClothingImage(new Blob([bytes], { type }), classifier);
      const ms = Math.round(performance.now() - started);

      const summary =
        result.status === "ok"
          ? Object.entries(result.suggestions)
              .map(([field, s]) => `${field}=${"value" in s ? s.value : "-"} (${s.status})`)
              .join(", ")
          : `failed: ${result.reason}`;
      console.log(`${file} [${ms} ms] ${summary}`);
      expect(["ok", "failed"]).toContain(result.status);
    }
  });
});
