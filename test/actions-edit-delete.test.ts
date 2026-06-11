import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  requireUserId: vi.fn(async () => "u-me"),
  requireVerifiedUserId: vi.fn(async () => "u-me"),
  getCurrentUserId: vi.fn(async () => "u-me"),
}));
const queryMock = vi.fn();
vi.mock("@/lib/db", () => ({ query: (...a: unknown[]) => queryMock(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updateBrew, deleteBrew, updateBag, deleteBag } from "@/app/actions";

const brew = {
  id: "t-1",
  rating: 5,
  brew: "V60",
  note: "n",
  dose: "15g",
  ratio: "1:16",
  temp: "94°C",
};
const bag = {
  id: "b-1",
  name: "Idido",
  roasterName: "Ember",
  origin: "Gedeb",
  region: "Yirgacheffe",
  altitude: "1800 masl",
  farm: "",
  varieties: [],
  process: "Washed",
  roast: "Light",
  scaScore: 88,
  flavors: [],
  color: "#b07a3c",
};

beforeEach(() => queryMock.mockReset());

describe("edit/delete ownership guards", () => {
  it("updateBrew filters by id AND user_id and throws on 0 rows", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await expect(updateBrew(brew)).rejects.toThrow();
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(
      /update tastings set[\s\S]*where id = \$1 and user_id = \$2/i,
    );
    expect(sql).not.toMatch(/created_at|time\s*=/i);
    expect(params).toContain("t-1");
    expect(params).toContain("u-me");
  });
  it("updateBrew re-selects the denormalized row by id after the ownership-guarded UPDATE", async () => {
    // Ownership is enforced by the UPDATE (prior test); the re-select (getTastingById)
    // fetches by id with $1=viewer for likedByMe — a foreign/deleted row can't surface
    // because the UPDATE's rowCount==0 throws before this runs.
    queryMock.mockResolvedValueOnce({ rowCount: 1 }); // UPDATE (where id=$1 and user_id=$2)
    queryMock.mockResolvedValueOnce({ rows: [{ id: "t-1", userId: "u-me" }] }); // getTastingById SELECT
    const t = await updateBrew(brew);
    expect(t.id).toBe("t-1");
    const [selSql, selParams] = queryMock.mock.calls[1] as [string, unknown[]];
    expect(selSql).toMatch(
      /select[\s\S]*from tastings t[\s\S]*where t\.id = \$2/i,
    );
    expect(selParams).toEqual(["u-me", "t-1"]); // [viewer, id]
  });
  it("deleteBrew is ownership-guarded", async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [{ id: "t-1" }] });
    await deleteBrew("t-1");
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(
      /delete from tastings where id = \$1 and user_id = \$2/i,
    );
    expect(params).toEqual(["t-1", "u-me"]);
  });
  it("updateBag is ownership-guarded and validated", async () => {
    queryMock.mockResolvedValue({ rows: [{ id: "b-1" }] });
    await updateBag(bag);
    const [sql] = queryMock.mock.calls[0] as [string];
    expect(sql).toMatch(
      /update beans set[\s\S]*where id = \$1 and user_id = \$2/i,
    );
  });
  it("updateBag rejects invalid input before the db", async () => {
    await expect(updateBag({ ...bag, name: "" })).rejects.toThrow();
    expect(queryMock).not.toHaveBeenCalled();
  });
  it("deleteBag is ownership-guarded (cascade handled by FK)", async () => {
    queryMock.mockResolvedValue({ rowCount: 1, rows: [{ id: "b-1" }] });
    await deleteBag("b-1");
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/delete from beans where id = \$1 and user_id = \$2/i);
    expect(params).toEqual(["b-1", "u-me"]);
  });
});
