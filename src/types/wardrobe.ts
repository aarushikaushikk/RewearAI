// Allowed wardrobe attribute values, shared by the Mongoose models, forms, and filters.
// Client-safe: no server imports.

export const CATEGORIES = [
  "Top",
  "Bottom",
  "Outerwear",
  "Dress",
  "Shoes",
  "Accessory",
] as const;

export const COLORS = [
  "Black",
  "White",
  "Grey",
  "Charcoal",
  "Beige",
  "Camel",
  "Brown",
  "Red",
  "Burgundy",
  "Pink",
  "Orange",
  "Yellow",
  "Green",
  "Blue",
  "Navy",
  "Indigo",
  "Purple",
  "Multicolor",
] as const;

export const SEASONS = [
  "Spring",
  "Summer",
  "Autumn",
  "Winter",
  "All-season",
] as const;

export const FORMALITIES = ["Casual", "Smart casual", "Formal"] as const;

export type Category = (typeof CATEGORIES)[number];
export type Color = (typeof COLORS)[number];
export type Season = (typeof SEASONS)[number];
export type Formality = (typeof FORMALITIES)[number];

export interface WardrobeImage {
  url: string;
  publicId: string;
}

/** Wardrobe item as returned to the client by the API. */
export interface WardrobeItemDto {
  id: string;
  image: WardrobeImage;
  name?: string;
  category: Category;
  color: Color;
  style: string;
  season: Season;
  formality: Formality;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A stored wardrobe item, as repositories return it. */
export interface WardrobeItemRecord {
  id: string;
  ownerId: string;
  image: WardrobeImage;
  name: string | null;
  category: Category;
  color: Color;
  style: string;
  season: Season;
  formality: Formality;
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Validated details for a new item, before ownership and the stored image are attached. */
export interface NewWardrobeItem {
  publicId: string;
  name: string | null;
  category: Category;
  color: Color;
  style: string;
  season: Season;
  formality: Formality;
}

/** The details a user can edit on a saved item (US4): everything but the image and availability. */
export type WardrobeItemDetails = Omit<NewWardrobeItem, "publicId">;

export interface CreateWardrobeItemDTO extends WardrobeItemDetails {
  ownerId: string;
  image: WardrobeImage;
}
