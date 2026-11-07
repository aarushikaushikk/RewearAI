import { describe, expect, it } from "vitest";
import { getBrowserClassifier } from "./getBrowserClassifier";

describe("getBrowserClassifier", () => {
  it("returns null where Web Workers don't exist, such as during server rendering", () => {
    expect(typeof Worker).toBe("undefined");
    expect(getBrowserClassifier()).toBeNull();
  });
});
