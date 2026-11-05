import "server-only";
import {
  type InferSchemaType,
  type Model,
  model,
  models,
  Schema,
} from "mongoose";
import { FEEDBACK_RATINGS } from "@/types/outfit";

// Separate from Outfit; Outfit.feedback holds this record's ID.
const feedbackSchema = new Schema(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Unique: changing feedback updates this record; a retry cannot add a second one.
    outfit: {
      type: Schema.Types.ObjectId,
      ref: "Outfit",
      required: true,
      unique: true,
    },
    rating: { type: String, required: true, enum: FEEDBACK_RATINGS },
  },
  { timestamps: true },
);

export type FeedbackRecord = InferSchemaType<typeof feedbackSchema>;

// Reuse the compiled model across hot reloads.
export const Feedback =
  (models.Feedback as Model<FeedbackRecord> | undefined) ??
  model<FeedbackRecord>("Feedback", feedbackSchema);
