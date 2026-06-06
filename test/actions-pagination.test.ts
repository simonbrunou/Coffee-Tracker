import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  requireUserId: vi.fn(async () => "u-me"),
  getCurrentUserId: vi.fn(async () => "u-me"),
}));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/queries", () => ({
  isFeedTab: (s: string) => ["Recent", "Following", "Popular"].includes(s),
  getFeedPage: vi.fn(async () => ({ rows: [{ id: "t-1" }], nextCursor: "cur" })),
  BEAN_COLS: "",
  getComments: vi.fn(),
  getTastingById: vi.fn(),
  getCommentById: vi.fn(),
}));

import { loadMoreFeed } from "@/app/actions";

describe("loadMoreFeed", () => {
  it("rejects an invalid feed tab before querying", async () => {
    await expect(loadMoreFeed("Nope", null)).rejects.toThrow(/invalid feed tab/i);
  });
  it("delegates a valid tab to getFeedPage and returns the page", async () => {
    const p = await loadMoreFeed("Recent", null);
    expect(p).toEqual({ rows: [{ id: "t-1" }], nextCursor: "cur" });
  });
});
