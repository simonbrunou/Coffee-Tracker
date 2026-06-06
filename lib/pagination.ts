export interface Cursor {
  ts: string;
  id: string;
}
export interface Page<T> {
  rows: T[];
  nextCursor: string | null;
}

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

export function decodeCursor(s: string | null | undefined): Cursor | null {
  if (!s) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid cursor");
  }
  const c = parsed as Partial<Cursor>;
  if (typeof c?.ts !== "string" || typeof c?.id !== "string" || !c.id || Number.isNaN(Date.parse(c.ts))) {
    throw new Error("Invalid cursor");
  }
  return { ts: c.ts, id: c.id };
}

export function clampLimit(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

/** Slice an over-fetched (limit+1) result into a Page, deriving nextCursor. */
export function toPage<T extends { id: string; createdAt: Date | string }>(rows: T[], limit: number): Page<T> {
  if (rows.length <= limit) return { rows, nextCursor: null };
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const ts = last.createdAt instanceof Date ? last.createdAt.toISOString() : String(last.createdAt);
  return { rows: page, nextCursor: encodeCursor({ ts, id: last.id }) };
}
