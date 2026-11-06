import "server-only";
import {
  type InferSchemaType,
  type Model,
  model,
  models,
  Schema,
} from "mongoose";
import { AUTH_PROVIDERS } from "@/types/account";

// An OAuth identity (e.g. a Google account) linked to a User. Only the stable
// provider ID is kept; OAuth access and refresh tokens are not stored.
const accountSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    provider: { type: String, required: true, enum: AUTH_PROVIDERS },
    // The provider's own user ID (Google's `sub`), not the email.
    providerAccountId: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

// A provider identity can belong to only one user.
accountSchema.index({ provider: 1, providerAccountId: 1 }, { unique: true });
// One link per provider per user, so a retried sign-in cannot add a duplicate.
accountSchema.index({ userId: 1, provider: 1 }, { unique: true });

export type AccountRecord = InferSchemaType<typeof accountSchema>;

// Reuse the compiled model across hot reloads.
export const Account =
  (models.Account as Model<AccountRecord> | undefined) ??
  model<AccountRecord>("Account", accountSchema);
