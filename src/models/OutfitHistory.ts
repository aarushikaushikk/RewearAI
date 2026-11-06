import "server-only";
import {
  type InferSchemaType,
  type Model,
  model,
  models,
  Schema,
} from "mongoose";

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
function isLocalDate(value: string) {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) {
    return false;
  }
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

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
  },
  { timestamps: true },
);

// One record per outfit per day, so a retried "mark as worn" cannot duplicate it.
outfitHistorySchema.index({ outfit: 1, wornOn: 1 }, { unique: true });
// Chronological history view, most recent first.
outfitHistorySchema.index({ owner: 1, wornOn: -1 });

export type OutfitHistoryRecord = InferSchemaType<typeof outfitHistorySchema>;

// Reuse the compiled model across hot reloads.
export const OutfitHistory =
  (models.OutfitHistory as Model<OutfitHistoryRecord> | undefined) ??
  model<OutfitHistoryRecord>("OutfitHistory", outfitHistorySchema);
