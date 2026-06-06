import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth", () => ({ requireUserId: vi.fn(async () => "u-me"), getCurrentUserId: vi.fn(async () => "u-me") }));
const queryMock = vi.fn();
vi.mock("@/lib/db", () => ({ query: (...a: unknown[]) => queryMock(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/queries", () => ({ getComments: vi.fn(async () => [{ id: "c-1" }]), BEAN_COLS: "", TASTING_COLS: "" }));

import { toggleFollowUser, toggleSaveTasting, addComment, updateComment, deleteComment } from "@/app/actions";

beforeEach(() => queryMock.mockReset());

describe("social actions", () => {
  it("toggleFollowUser(follow) inserts idempotently; rejects self-follow", async () => {
    await expect(toggleFollowUser("u-me", true)).rejects.toThrow();
    expect(queryMock).not.toHaveBeenCalled();
    queryMock.mockResolvedValue({});
    await toggleFollowUser("u-2", true);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/insert into user_follows[\s\S]*on conflict do nothing/i);
    expect(params).toEqual(["u-me", "u-2"]);
  });
  it("toggleFollowUser(unfollow) deletes the edge", async () => {
    queryMock.mockResolvedValue({});
    await toggleFollowUser("u-2", false);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/delete from user_follows where follower_id = \$1 and followee_id = \$2/i);
    expect(params).toEqual(["u-me", "u-2"]);
  });
  it("toggleSaveTasting inserts against tasting_saves", async () => {
    queryMock.mockResolvedValue({});
    await toggleSaveTasting("t-1", true);
    expect((queryMock.mock.calls[0][0] as string)).toMatch(/insert into tasting_saves[\s\S]*on conflict do nothing/i);
  });
  it("addComment validates then inserts and returns the row", async () => {
    await expect(addComment({ tastingId: "t-1", body: "" })).rejects.toThrow();
    expect(queryMock).not.toHaveBeenCalled();
    queryMock.mockResolvedValue({ rows: [{ id: "c-9", tastingId: "t-1", userId: "u-me", body: "hi" }] });
    const c = await addComment({ tastingId: "t-1", body: "hi" });
    expect(c.id).toBe("c-9");
    expect((queryMock.mock.calls[0][0] as string)).toMatch(/insert into comments/i);
  });
  it("updateComment is ownership-guarded", async () => {
    queryMock.mockResolvedValue({ rows: [{ id: "c-1" }] });
    await updateComment({ id: "c-1", body: "edited" });
    expect((queryMock.mock.calls[0][0] as string)).toMatch(/update comments set body = \$3, updated_at = now\(\) where id = \$1 and user_id = \$2/i);
  });
  it("deleteComment is ownership-guarded and throws on 0 rows", async () => {
    queryMock.mockResolvedValue({ rowCount: 0 });
    await expect(deleteComment("c-1")).rejects.toThrow();
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/delete from comments where id = \$1 and user_id = \$2/i);
    expect(params).toEqual(["c-1", "u-me"]);
  });
});
