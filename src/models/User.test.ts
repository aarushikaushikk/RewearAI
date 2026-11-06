import { describe, expect, expectTypeOf, it } from "vitest";
import { toValidationError } from "../../tests/validationError";
import { User } from "./User";

// Same shape bcryptjs produces: $2b$<cost>$ + 53 base64 characters.
const BCRYPT_HASH = `$2b$10$${"a".repeat(53)}`;

describe("User model", () => {
  it("accepts a valid user and normalizes the email", async () => {
    const user = new User({
      name: "  Aarushi  ",
      email: "  Aarushi@Example.COM ",
      image: "https://lh3.googleusercontent.com/a/photo.jpg",
    });

    await expect(user.validate()).resolves.toBeUndefined();
    expect(user.name).toBe("Aarushi");
    expect(user.email).toBe("aarushi@example.com");
  });

  it("allows a user without a profile image", async () => {
    const user = new User({ name: "Pranav", email: "pranav@example.com" });

    await expect(user.validate()).resolves.toBeUndefined();
  });

  it("allows a user without a name (optional on sign-up)", async () => {
    const user = new User({ email: "pranav@example.com" });

    await expect(user.validate()).resolves.toBeUndefined();
  });

  it("rejects a user missing email", async () => {
    const error = await new User({ name: "Aarushi" })
      .validate()
      .catch(toValidationError);

    expect(error?.errors.email?.kind).toBe("required");
  });

  it("defaults passwordHash to null for Google-only accounts", () => {
    const user = new User({ email: "aarushi@example.com" });

    expect(user.passwordHash).toBeNull();
  });

  it("accepts a bcrypt password hash for email/password accounts", async () => {
    const user = new User({
      email: "aarushi@example.com",
      passwordHash: BCRYPT_HASH,
    });

    await expect(user.validate()).resolves.toBeUndefined();
  });

  it("rejects a passwordHash that is not a bcrypt hash", async () => {
    const error = await new User({
      email: "aarushi@example.com",
      passwordHash: "plain-text-password",
    })
      .validate()
      .catch(toValidationError);

    expect(error?.errors.passwordHash).toBeDefined();
  });

  it("leaves passwordHash out of query results unless asked for", () => {
    expect(User.schema.path("passwordHash").options.select).toBe(false);
  });

  it("rejects an invalid email address", async () => {
    const error = await new User({ name: "Aarushi", email: "not-an-email" })
      .validate()
      .catch(toValidationError);

    expect(error?.errors.email).toBeDefined();
  });

  it("rejects a non-https profile image URL", async () => {
    const error = await new User({
      name: "Aarushi",
      email: "aarushi@example.com",
      image: "javascript:alert(1)",
    })
      .validate()
      .catch(toValidationError);

    expect(error?.errors.image).toBeDefined();
  });

  it("enforces a unique email index", () => {
    expect(User.schema.path("email").options.unique).toBe(true);
  });

  it("exposes typed documents rather than any", () => {
    const user = new User({ name: "Aarushi", email: "aarushi@example.com" });

    expectTypeOf(user.email).toEqualTypeOf<string>();
    // undefined when a query did not select the hidden field.
    expectTypeOf(user.passwordHash).toEqualTypeOf<string | null | undefined>();
  });
});
