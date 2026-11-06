import "server-only";
import {
  type InferSchemaType,
  type Model,
  model,
  models,
  Schema,
} from "mongoose";

// SHA-256 hex digest; the raw session token is never stored.
const TOKEN_HASH_PATTERN = /^[a-f0-9]{64}$/;

const sessionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      match: [TOKEN_HASH_PATTERN, "Token hash must be a SHA-256 hex digest."],
    },
    expiresAt: { type: Date, required: true },
    // Set on logout; a revoked session is no longer active.
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// MongoDB deletes each session once its expiry time has passed.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type SessionRecord = InferSchemaType<typeof sessionSchema>;

// Reuse the compiled model across hot reloads.
export const Session =
  (models.Session as Model<SessionRecord> | undefined) ??
  model<SessionRecord>("Session", sessionSchema);
