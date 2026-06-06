import { describe, it, expect } from "vitest";
import { validateComment, validateUpdateComment } from "@/lib/comment-validation";

describe("validateComment", () => {
  it("rejects empty / whitespace", () => {
    expect(validateComment({ tastingId: "t-1", body: "" }).ok).toBe(false);
    expect(validateComment({ tastingId: "t-1", body: "   " }).ok).toBe(false);
  });
  it("requires a tastingId", () => {
    expect(validateComment({ tastingId: "", body: "hi" }).ok).toBe(false);
  });
  it("trims and accepts", () => {
    const r = validateComment({ tastingId: "t-1", body: "  nice pour  " });
    if (r.ok) { expect(r.value.body).toBe("nice pour"); expect(r.value.tastingId).toBe("t-1"); }
    else throw new Error("should pass");
  });
  it("rejects over 500 chars", () => {
    expect(validateComment({ tastingId: "t-1", body: "x".repeat(501) }).ok).toBe(false);
  });
});
describe("validateUpdateComment", () => {
  it("requires an id and a valid body", () => {
    expect(validateUpdateComment({ id: "", body: "hi" }).ok).toBe(false);
    expect(validateUpdateComment({ id: "c-1", body: "" }).ok).toBe(false);
    const r = validateUpdateComment({ id: "c-1", body: " hey " });
    if (r.ok) expect(r.value.body).toBe("hey"); else throw new Error("should pass");
  });
});
