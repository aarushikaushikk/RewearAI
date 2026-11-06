import "server-only";
import {
  type InferSchemaType,
  type Model,
  model,
  models,
  Schema,
  type Types,
} from "mongoose";
import { OCCASIONS } from "@/types/outfit";

function hasDistinctItems(items: Types.ObjectId[]) {
  return new Set(items.map(String)).size === items.length;
}

const outfitSchema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // References only: an outfit never copies or invents clothing data.
    items: {
      type: [{ type: Schema.Types.ObjectId, ref: "WardrobeItem" }],
      validate: [
        {
          validator: (items: Types.ObjectId[]) => items.length > 0,
          message: "An outfit needs at least one wardrobe item.",
        },
        {
          validator: hasDistinctItems,
          message: "An outfit cannot include the same item twice.",
        },
      ],
    },
    occasion: { type: String, required: true, enum: OCCASIONS },
    explanation: { type: String, required: true, trim: true, maxlength: 500 },
    isSaved: { type: Boolean, required: true, default: false },
    feedback: { type: Schema.Types.ObjectId, ref: "Feedback" },
  },
  { timestamps: true },
);

export type OutfitRecord = InferSchemaType<typeof outfitSchema>;

// Reuse the compiled model across hot reloads.
export const Outfit =
  (models.Outfit as Model<OutfitRecord> | undefined) ??
  model<OutfitRecord>("Outfit", outfitSchema);
