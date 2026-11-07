// Candidate text prompts for zero-shot image classification (for example CLIP), and the
// wardrobe value each prompt stands for. The model scores the image against these prompts;
// it can only ever choose among them, so every suggestion maps to an allowed value.

import type { Category, Color, Formality, Season } from "@/types/wardrobe";

export interface GarmentPrompt {
  prompt: string;
  category: Category;
  /** Suggested `style` text when this prompt wins. */
  style: string;
}

export const GARMENT_PROMPTS: readonly GarmentPrompt[] = [
  { prompt: "a photo of a t-shirt", category: "Top", style: "T-shirt" },
  { prompt: "a photo of a button-down shirt", category: "Top", style: "Button-down shirt" },
  { prompt: "a photo of a blouse", category: "Top", style: "Blouse" },
  { prompt: "a photo of a sweater", category: "Top", style: "Sweater" },
  { prompt: "a photo of a hoodie", category: "Top", style: "Hoodie" },
  { prompt: "a photo of a tank top", category: "Top", style: "Tank top" },
  { prompt: "a photo of a pair of jeans", category: "Bottom", style: "Jeans" },
  { prompt: "a photo of a pair of trousers", category: "Bottom", style: "Trousers" },
  { prompt: "a photo of a pair of shorts", category: "Bottom", style: "Shorts" },
  { prompt: "a photo of a skirt", category: "Bottom", style: "Skirt" },
  { prompt: "a photo of a jacket", category: "Outerwear", style: "Jacket" },
  { prompt: "a photo of a coat", category: "Outerwear", style: "Coat" },
  { prompt: "a photo of a blazer", category: "Outerwear", style: "Blazer" },
  { prompt: "a photo of a dress", category: "Dress", style: "Dress" },
  { prompt: "a photo of a pair of sneakers", category: "Shoes", style: "Sneakers" },
  { prompt: "a photo of a pair of boots", category: "Shoes", style: "Boots" },
  { prompt: "a photo of a pair of dress shoes", category: "Shoes", style: "Dress shoes" },
  { prompt: "a photo of a pair of sandals", category: "Shoes", style: "Sandals" },
  { prompt: "a photo of a handbag", category: "Accessory", style: "Bag" },
  { prompt: "a photo of a hat", category: "Accessory", style: "Hat" },
  { prompt: "a photo of a scarf", category: "Accessory", style: "Scarf" },
  { prompt: "a photo of a belt", category: "Accessory", style: "Belt" },
];

/** Scored alongside garments; if these win, the image isn't treated as clothing. */
export const NOT_CLOTHING_PROMPTS: readonly string[] = [
  "a photo of a person's face",
  "a photo of an animal",
  "a photo of food",
  "a photo of a landscape",
  "a photo of furniture",
  "a screenshot or a document",
];

const COLOR_WORDS: Record<Color, string> = {
  Black: "black",
  White: "white",
  Grey: "grey",
  Charcoal: "charcoal grey",
  Beige: "beige",
  Camel: "camel",
  Brown: "brown",
  Red: "red",
  Burgundy: "burgundy",
  Pink: "pink",
  Orange: "orange",
  Yellow: "yellow",
  Green: "green",
  Blue: "blue",
  Navy: "navy blue",
  Indigo: "indigo",
  Purple: "purple",
  Multicolor: "multicolored",
};

export const COLOR_PROMPTS: ReadonlyMap<string, Color> = new Map(
  (Object.entries(COLOR_WORDS) as [Color, string][]).map(([color, word]) => [
    `a photo of a ${word} clothing item`,
    color,
  ]),
);

export const SEASON_PROMPTS: ReadonlyMap<string, Season> = new Map([
  ["a photo of light clothing for spring", "Spring"],
  ["a photo of clothing for hot summer weather", "Summer"],
  ["a photo of clothing for cool autumn weather", "Autumn"],
  ["a photo of warm clothing for cold winter weather", "Winter"],
  ["a photo of everyday clothing worn in any season", "All-season"],
]);

export const FORMALITY_PROMPTS: ReadonlyMap<string, Formality> = new Map([
  ["a photo of casual everyday clothing", "Casual"],
  ["a photo of smart casual clothing", "Smart casual"],
  ["a photo of formal clothing for a formal event", "Formal"],
]);

/** Every prompt, in one list, for a single model call. */
export const ALL_PROMPTS: readonly string[] = [
  ...GARMENT_PROMPTS.map((g) => g.prompt),
  ...NOT_CLOTHING_PROMPTS,
  ...COLOR_PROMPTS.keys(),
  ...SEASON_PROMPTS.keys(),
  ...FORMALITY_PROMPTS.keys(),
];
