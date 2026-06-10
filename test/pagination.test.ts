import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor, clampLimit, toPage, DEFAULT_LIMIT, MAX_LIMIT } from "@/lib/pagination";

describe("cursor", () => {
  it("round-trips ts+id", () => {
    const c = { ts: "2026-06-06T10:00:00.000Z", id: "abc" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });
  it("null/undefined/empty → null", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });
  it("garbage throws", () => {
    expect(() => decodeCursor("!!!not-base64-json!!!")).toThrow();
    expect(() => decodeCursor(encodeCursor({ ts: "nope", id: "x" }))).toThrow();
    expect(() => decodeCursor(encodeCursor({ ts: "2026-06-06T10:00:00.000Z", id: "" }))).toThrow();
  });
});

describe("clampLimit", () => {
  it("defaults + clamps + parses", () => {
    expect(clampLimit(undefined)).toBe(DEFAULT_LIMIT);
    expect(clampLimit(0)).toBe(DEFAULT_LIMIT);
    expect(clampLimit(-3)).toBe(DEFAULT_LIMIT);
    expect(clampLimit(5)).toBe(5);
    expect(clampLimit(9999)).toBe(MAX_LIMIT);
    expect(clampLimit("30")).toBe(30);
  });
});

describe("toPage", () => {
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `id${i}`, createdAt: new Date(1_700_000_000_000 - i * 1000) }));
  it("no next cursor when rows <= limit", () => {
    const p = toPage(rows(3), 5);
    expect(p.rows).toHaveLength(3);
    expect(p.nextCursor).toBeNull();
  });
  it("derives next cursor from the limit-th row when over-fetched", () => {
    const p = toPage(rows(6), 5); // 6 fetched, limit 5
    expect(p.rows).toHaveLength(5);
    expect(p.nextCursor).not.toBeNull();
    expect(decodeCursor(p.nextCursor)).toEqual({ ts: rows(6)[4].createdAt.toISOString(), id: "id4" });
  });
});
