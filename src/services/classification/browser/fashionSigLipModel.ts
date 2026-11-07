// Loads Marqo-FashionSigLIP with Transformers.js, following the model card's published example.
// Import this only from the classification worker (or Node test scripts), never from page code,
// so the page bundle and the server never include Transformers.js.

import {
  AutoProcessor,
  AutoTokenizer,
  RawImage,
  SiglipTextModel,
  SiglipVisionModel,
} from "@huggingface/transformers";
import type { ClassifiableImage } from "@/types/classification";
import type { Embedding } from "../zeroShotScoring";
import type { ZeroShotEmbeddingModel } from "./classifierRequestHandler";

export const FASHION_SIGLIP_MODEL_ID = "Marqo/marqo-fashionSigLIP";

/** 8-bit quantized weights: about 94 MB (vision) plus 111 MB (text), downloaded once and cached. */
const MODEL_OPTIONS = { dtype: "q8" } as const;

interface EmbeddingTensor {
  tolist(): unknown;
}

function rows(tensor: EmbeddingTensor | undefined, name: string): Embedding[] {
  const list = tensor?.tolist();
  if (!Array.isArray(list)) throw new Error(`The model returned no ${name}.`);
  return list as Embedding[];
}

export async function loadFashionSigLip(): Promise<ZeroShotEmbeddingModel> {
  const [tokenizer, processor, textModel, visionModel] = await Promise.all([
    AutoTokenizer.from_pretrained(FASHION_SIGLIP_MODEL_ID),
    AutoProcessor.from_pretrained(FASHION_SIGLIP_MODEL_ID),
    SiglipTextModel.from_pretrained(FASHION_SIGLIP_MODEL_ID, MODEL_OPTIONS),
    SiglipVisionModel.from_pretrained(FASHION_SIGLIP_MODEL_ID, MODEL_OPTIONS),
  ]);

  return {
    async embedTexts(labels) {
      // SigLIP was trained on max-length padding; the model card pads the same way.
      const inputs = tokenizer([...labels], { padding: "max_length", truncation: true });
      const { text_embeds } = await textModel(inputs);
      return rows(text_embeds, "text embeddings");
    },

    async embedImage(image: ClassifiableImage) {
      const raw = typeof image === "string" ? await RawImage.read(image) : await RawImage.fromBlob(image);
      const { image_embeds } = await visionModel(await processor(raw));
      const [embedding] = rows(image_embeds, "image embedding");
      if (!embedding) throw new Error("The model returned no image embedding.");
      return embedding;
    },
  };
}
