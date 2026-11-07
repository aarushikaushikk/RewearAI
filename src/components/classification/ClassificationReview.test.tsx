// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClassificationResult } from "@/types/classification";
import { ClassificationReview, type ClassificationReviewProps } from "./ClassificationReview";

afterEach(cleanup);

const IMAGE_URL = "blob:http://localhost/photo-1";
const REVIEW_MESSAGE = "Review or correct the highlighted details before saving.";

const mixedResult: ClassificationResult = {
  status: "ok",
  suggestions: {
    category: { status: "suggested", value: "Bottom" },
    color: { status: "uncertain", value: "Navy" },
    style: { status: "suggested", value: "Jeans" },
    season: { status: "missing" },
    formality: { status: "invalid" },
  },
  fieldsNeedingReview: ["color", "season", "formality"],
};

const confidentResult: ClassificationResult = {
  status: "ok",
  suggestions: {
    category: { status: "suggested", value: "Top" },
    color: { status: "suggested", value: "White" },
    style: { status: "suggested", value: "T-shirt" },
    season: { status: "suggested", value: "Summer" },
    formality: { status: "suggested", value: "Casual" },
  },
  fieldsNeedingReview: [],
};

function setup(props: Partial<ClassificationReviewProps> = {}) {
  const onConfirm = vi.fn();
  const onRetry = vi.fn();
  render(
    <ClassificationReview
      imageUrl={IMAGE_URL}
      classification={mixedResult}
      onConfirm={onConfirm}
      onRetry={onRetry}
      {...props}
    />,
  );
  return { user: userEvent.setup({ delay: null }), onConfirm, onRetry };
}

const field = (name: string) => screen.getByLabelText(new RegExp(`^${name}`, "i"));
const save = () => screen.getByRole("button", { name: "Save to My Wardrobe" });

describe("ClassificationReview", () => {
  it("shows the photo and a loading message, and offers manual entry while analyzing", async () => {
    const { user } = setup({ classification: { status: "loading" } });
    expect(screen.getByRole("img")).toHaveProperty("src", IMAGE_URL);
    expect(screen.getByRole("status").textContent).toMatch(/analyzing your image/i);

    await user.click(screen.getByRole("button", { name: "Enter details manually" }));
    expect((field("Category") as HTMLSelectElement).value).toBe("");
  });

  it("prefills suggestions and labels each field's status in text", () => {
    setup();
    expect((field("Category") as HTMLSelectElement).value).toBe("Bottom");
    expect((field("Color") as HTMLSelectElement).value).toBe("Navy");
    expect((field("Style") as HTMLInputElement).value).toBe("Jeans");
    expect((field("Season") as HTMLSelectElement).value).toBe("");
    expect((field("Formality") as HTMLSelectElement).value).toBe("");

    // The status badge is announced with its field, through aria-describedby.
    const statusOf = (name: string) => {
      const statusId = field(name).getAttribute("aria-describedby")?.split(" ")[0] ?? "";
      const badge = document.getElementById(statusId);
      expect(badge?.dataset.testid).toBe("field-status");
      return badge?.textContent;
    };
    expect(statusOf("Category")).toBe("Suggested");
    expect(statusOf("Color")).toBe("Needs review");
    expect(statusOf("Season")).toBe("Not detected");
    expect(statusOf("Formality")).toBe("Suggestion not usable");
  });

  it("lets the user edit all five fields and confirms the edited values", async () => {
    const { user, onConfirm } = setup({ classification: confidentResult });
    await user.selectOptions(field("Category"), "Outerwear");
    await user.selectOptions(field("Color"), "Black");
    await user.clear(field("Style"));
    await user.type(field("Style"), "  Denim jacket ");
    await user.selectOptions(field("Season"), "Autumn");
    await user.selectOptions(field("Formality"), "Smart casual");
    await user.click(save());

    expect(onConfirm).toHaveBeenCalledExactlyOnceWith({
      category: "Outerwear",
      color: "Black",
      style: "Denim jacket",
      season: "Autumn",
      formality: "Smart casual",
    });
  });

  it("blocks saving until uncertain values are reviewed and missing ones completed", async () => {
    const { user, onConfirm } = setup();
    await user.click(save());

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(REVIEW_MESSAGE);
    expect(field("Color").getAttribute("aria-invalid")).toBe("true");
    expect(field("Season").getAttribute("aria-invalid")).toBe("true");
    expect(field("Formality").getAttribute("aria-invalid")).toBe("true");
    expect(field("Category").getAttribute("aria-invalid")).toBe("false");
    const colorErrorId = field("Color").getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(colorErrorId.split(" ").at(-1)!)?.textContent).toMatch(
      /confirm or change/i,
    );

    await user.click(screen.getByRole("checkbox", { name: /navy is correct/i }));
    await user.selectOptions(field("Season"), "All-season");
    await user.selectOptions(field("Formality"), "Casual");
    await user.click(save());
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith({
      category: "Bottom",
      color: "Navy",
      style: "Jeans",
      season: "All-season",
      formality: "Casual",
    });
  });

  it("counts changing an uncertain value as reviewing it", async () => {
    const { user, onConfirm } = setup();
    await user.selectOptions(field("Color"), "Indigo");
    await user.selectOptions(field("Season"), "Winter");
    await user.selectOptions(field("Formality"), "Casual");
    await user.click(save());
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ color: "Indigo" }));
  });

  it("rejects a blank style", async () => {
    const { user, onConfirm } = setup({ classification: confidentResult });
    await user.clear(field("Style"));
    await user.type(field("Style"), "   ");
    await user.click(save());
    expect(onConfirm).not.toHaveBeenCalled();
    expect(field("Style").getAttribute("aria-invalid")).toBe("true");
  });

  it("explains a failed analysis and offers retry and manual entry", async () => {
    const { user, onRetry, onConfirm } = setup({
      classification: { status: "failed", reason: "unavailable" },
    });
    expect(screen.getByRole("alert").textContent).toContain(
      "We couldn't analyze this image. You can retry or enter details manually.",
    );
    await user.click(screen.getByRole("button", { name: "Retry analysis" }));
    expect(onRetry).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Enter details manually" }));
    await user.selectOptions(field("Category"), "Shoes");
    await user.selectOptions(field("Color"), "White");
    await user.type(field("Style"), "Sneakers");
    await user.selectOptions(field("Season"), "All-season");
    await user.selectOptions(field("Formality"), "Casual");
    await user.click(save());
    expect(onConfirm).toHaveBeenCalledWith({
      category: "Shoes",
      color: "White",
      style: "Sneakers",
      season: "All-season",
      formality: "Casual",
    });
  });

  it("says when the image doesn't look like clothing", () => {
    setup({ classification: { status: "failed", reason: "not_clothing" } });
    expect(screen.getByRole("alert").textContent).toMatch(/doesn't look like a clothing item/i);
  });

  it("disables saving while the parent saves, and shows a save error without losing edits", () => {
    setup({
      classification: confidentResult,
      isSubmitting: true,
      submitError: "We couldn't save this item. Try again.",
    });
    expect(save()).toHaveProperty("disabled", true);
    expect(screen.getByRole("alert").textContent).toContain("We couldn't save this item.");
    expect((field("Style") as HTMLInputElement).value).toBe("T-shirt");
  });
});
