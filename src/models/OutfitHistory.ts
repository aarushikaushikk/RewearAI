import "server-only";
import {
  type InferSchemaType,
  type Model,
  model,
  models,
  Schema,
} from "mongoose";
import { isLocalDate } from "@/lib/dates/localDate";

const outfitHistorySchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    outfit: { type: Schema.Types.ObjectId, ref: "Outfit", required: true },
    wornOn: {
      type: String,
      required: true,
      validate: {
        validator: isLocalDate,
        message: "Worn date must be a calendar date in YYYY-MM-DD format.",
      },
    },
    // The outfit's sorted, lowercased item IDs (US10), so the same clothes match in any order.
    combinationKey: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

// One record per outfit per day, so a retried "mark as worn" cannot duplicate it.
outfitHistorySchema.index({ outfit: 1, wornOn: 1 }, { unique: true });
// The same clothes on the same day are one wear, even when concurrent requests use
// different outfit records for them.
outfitHistorySchema.index(
  { owner: 1, wornOn: 1, combinationKey: 1 },
  { unique: true },
);
// Chronological history view, most recent first.
outfitHistorySchema.index({ owner: 1, wornOn: -1 });

export type OutfitHistoryRecord = InferSchemaType<typeof outfitHistorySchema>;

// Reuse the compiled model across hot reloads.
export const OutfitHistory =
  (models.OutfitHistory as Model<OutfitHistoryRecord> | undefined) ??
  model<OutfitHistoryRecord>("OutfitHistory", outfitHistorySchema);
