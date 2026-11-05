import "server-only";
import {
  type InferSchemaType,
  type Model,
  model,
  models,
  Schema,
} from "mongoose";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HTTPS_URL_PATTERN = /^https:\/\/\S+$/;

// Accounts come from OAuth sign-in, so no password is stored.
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [EMAIL_PATTERN, "Enter a valid email address."],
    },
    image: {
      type: String,
      trim: true,
      match: [HTTPS_URL_PATTERN, "Profile image must be an https URL."],
    },
  },
  { timestamps: true },
);

export type UserRecord = InferSchemaType<typeof userSchema>;

// Reuse the compiled model across hot reloads.
export const User =
  (models.User as Model<UserRecord> | undefined) ??
  model<UserRecord>("User", userSchema);
