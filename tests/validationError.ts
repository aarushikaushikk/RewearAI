import { Error as MongooseError } from "mongoose";

/** Narrows a rejected `validate()` call to a Mongoose ValidationError. */
export function toValidationError(
  error: unknown,
): MongooseError.ValidationError {
  if (error instanceof MongooseError.ValidationError) {
    return error;
  }
  throw error;
}
