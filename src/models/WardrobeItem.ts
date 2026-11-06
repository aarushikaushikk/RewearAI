import "server-only";
import {
  type InferSchemaType,
  type Model,
  model,
  models,
  Schema,
} from "mongoose";
import { CATEGORIES, COLORS, FORMALITIES, SEASONS } from "@/types/wardrobe";

const HTTPS_URL_PATTERN = /^https:\/\/\S+$/;

// Only the Cloudinary URL and public ID are stored; the image itself lives in Cloudinary.
const imageSchema = new Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
      match: [HTTPS_URL_PATTERN, "Image URL must be an https URL."],
    },
    publicId: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const wardrobeItemSchema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    image: { type: imageSchema, required: true },
    name: { type: String, trim: true, maxlength: 80 },
    category: { type: String, required: true, enum: CATEGORIES },
    color: { type: String, required: true, enum: COLORS },
    style: { type: String, required: true, trim: true, maxlength: 40 },
    season: { type: String, required: true, enum: SEASONS },
    formality: { type: String, required: true, enum: FORMALITIES },
    isAvailable: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

// One record per Cloudinary image, so a retried save cannot create a duplicate item.
wardrobeItemSchema.index({ "image.publicId": 1 }, { unique: true });

export type WardrobeItemRecord = InferSchemaType<typeof wardrobeItemSchema>;

// Reuse the compiled model across hot reloads.
export const WardrobeItem =
  (models.WardrobeItem as Model<WardrobeItemRecord> | undefined) ??
  model<WardrobeItemRecord>("WardrobeItem", wardrobeItemSchema);
