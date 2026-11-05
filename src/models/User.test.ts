import { describe, expect, expectTypeOf, it } from "vitest";
import { toValidationError } from "../../tests/validationError";
import { User } from "./User";

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

  it.each(["name", "email"] as const)(
    "rejects a user missing %s",
    async (field) => {
      const data: Record<string, string> = {
        name: "Aarushi",
        email: "aarushi@example.com",
      };
      delete data[field];

      const error = await new User(data).validate().catch(toValidationError);

      expect(error?.errors[field]?.kind).toBe("required");
    },
  );

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
  });
});
