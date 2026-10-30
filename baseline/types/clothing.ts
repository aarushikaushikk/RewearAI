export type Category = "Top" | "Bottom" | "Outerwear" | "Dress" | "Shoes" | "Accessory";

export type Season = "Spring" | "Summer" | "Autumn" | "Winter" | "All-season";

export type Formality = "Casual" | "Smart casual" | "Formal";

export interface ClothingItem {
  id: string;
  name: string;
  category: Category;
  color: string;
  season: Season;
  formality: Formality;
  available: boolean;
}
