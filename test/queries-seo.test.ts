import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// lib/queries imports getCurrentUserId from ./auth (→ next-auth); mock it so the
// import chain resolves under Vitest.
vi.mock("@/lib/auth", () => ({ getCurrentUserId: vi.fn(async () => null), requireUserId: vi.fn(), requireVerifiedUserId: vi.fn() }));
const queryMock = vi.fn();
vi.mock("@/lib/db", () => ({ query: (...a: unknown[]) => queryMock(...a) }));

import { getRoasterById, getBeanIdsForSitemap, getRoasterIdsForSitemap } from "@/lib/queries";

beforeEach(() => queryMock.mockReset());

describe("getRoasterById", () => {
  it("selects by id ($2) and returns the row or null", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "r1", name: "Onyx" }] });
    const r = await getRoasterById("u1", "r1");
    expect(r).toMatchObject({ id: "r1" });
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/where r\.id = \$2/i);
    expect(params).toEqual(["u1", "r1"]);
  });
  it("returns null when no row", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await getRoasterById(null, "nope")).toBeNull();
  });
});

describe("sitemap enumeration queries are bounded + PII-free", () => {
  it("bean ids query has a LIMIT and selects no PII", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await getBeanIdsForSitemap();
    const [sql] = queryMock.mock.calls[0] as [string];
    expect(sql).toMatch(/limit \d+/i);
    expect(sql).not.toMatch(/email|password|user_id/i);
  });
  it("roaster ids query has a LIMIT", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await getRoasterIdsForSitemap();
    expect((queryMock.mock.calls[0] as [string])[0]).toMatch(/limit \d+/i);
  });
});

describe("metadata/page reads are React.cache-wrapped (spec requirement)", () => {
  const src = readFileSync(join(process.cwd(), "lib/queries.ts"), "utf8");
  it("exports cache-wrapped getBeanCached + getRoasterByIdCached", () => {
    expect(src).toMatch(/export const getBeanCached = cache\(/);
    expect(src).toMatch(/export const getRoasterByIdCached = cache\(/);
    expect(src).toMatch(/import \{ cache \} from "react"/);
  });
});
