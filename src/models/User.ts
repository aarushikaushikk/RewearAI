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
// bcrypt output; guards against ever storing a plain-text password.
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

// One user per email. Users sign in with a password, Google (see Account), or both.
const userSchema = new Schema(
  {
    name: { type: String, trim: true, maxlength: 100 },
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
    // Null for Google-only accounts. Excluded from queries unless selected
    // explicitly with `.select("+passwordHash")`.
    passwordHash: {
      type: String,
      default: null,
      select: false,
      match: [BCRYPT_HASH_PATTERN, "Password hash must be a bcrypt hash."],
    },
  },
  { timestamps: true },
);

export type UserRecord = InferSchemaType<typeof userSchema>;

// Reuse the compiled model across hot reloads.
export const User =
  (models.User as Model<UserRecord> | undefined) ??
  model<UserRecord>("User", userSchema);
