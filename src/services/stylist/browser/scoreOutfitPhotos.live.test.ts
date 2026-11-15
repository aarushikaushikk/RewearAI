// Opt-in check with the real FashionSigLIP model; skipped in normal runs (it downloads ~205 MB).
// Run: RUN_LIVE_MODEL=1 LIVE_IMAGE_DIR=<folder> npx vitest run scoreOutfitPhotos.live
// The folder holds clothing photos plus labels.csv with `file,category,color,style` rows.
// Optional: LIVE_MODEL_CACHE_DIR=<folder> keeps the download outside node_modules.
// Photos are read locally and never sent anywhere; never commit them.

import { readFileSync } from "node:fs";
import path from "node:path";
import { env } from "@huggingface/transformers";
import { describe, expect, it } from "vitest";
import { createClassifierRequestHandler } from "@/services/classification/browser/classifierRequestHandler";
import { loadFashionSigLip } from "@/services/classification/browser/fashionSigLipModel";
import { vibePrompt } from "@/services/stylist/stylistLibrary";
import { VIBES, vibeForStyle } from "@/services/stylist/styleVibes";
import type { LabelScore } from "@/types/classification";
import type { OutfitRole } from "@/types/outfit";
import { scoreOutfitPhotos } from "./scoreOutfitPhotos";

const imageDir = process.env.LIVE_IMAGE_DIR ?? "";
/** The spike's real-photo run reached 70% top-3 agreement with per-category prompts. */
const MIN_TOP3 = 0.65;

describe.skipIf(!process.env.RUN_LIVE_MODEL || !imageDir)("scoreOutfitPhotos with the live model", () => {
  it("ranks each photo's saved style among its top three vibes often enough", { timeout: 600_000 }, async () => {
    if (process.env.LIVE_MODEL_CACHE_DIR) env.cacheDir = process.env.LIVE_MODEL_CACHE_DIR;
    const handle = createClassifierRequestHandler(loadFashionSigLip);
    let nextId = 1;
    const classifier = async (image: Blob | string, labels: readonly string[]) => {
      const response = await handle({ type: "classify", id: nextId++, image, labels });
      if (response?.type !== "result") throw new Error(`worker error: ${JSON.stringify(response)}`);
      return response.scores as LabelScore[];
    };

    const rows = readFileSync(path.join(imageDir, "labels.csv"), "utf8").trim().split(/\r?\n/).slice(1);
    const photos = rows
      .map((row) => row.split(",").map((cell) => cell.trim()))
      .map(([file, category, , style]) => ({
        id: file,
        role: category.toLowerCase() as OutfitRole,
        url: path.join(imageDir, file),
        vibe: vibeForStyle(style),
      }))
      .filter((photo) => photo.vibe !== null);
    expect(photos.length).toBeGreaterThan(0);

    const started = performance.now();
    const scores = await scoreOutfitPhotos(photos, classifier, { timeoutMs: 600_000 });
    const msPerPhoto = Math.round((performance.now() - started) / photos.length);

    let top3 = 0;
    for (const photo of photos) {
      const labels = scores?.get(photo.id);
      const ranked = VIBES.map((vibe) => [vibe, labels?.get(vibePrompt(vibe, photo.role)) ?? 0] as const).sort(
        (a, b) => b[1] - a[1],
      );
      const hit = ranked.slice(0, 3).some(([vibe]) => vibe === photo.vibe);
      if (hit) top3++;
      console.log(`${photo.id}: saved=${photo.vibe} top3=${ranked.slice(0, 3).map(([v]) => v).join(",")}${hit ? "" : "  ✗"}`);
    }
    console.log(`top-3 agreement ${top3}/${photos.length}, ${msPerPhoto} ms per photo`);
    expect(top3 / photos.length).toBeGreaterThanOrEqual(MIN_TOP3);
  });
});
