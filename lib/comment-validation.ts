import type { AddCommentInput, UpdateCommentInput } from "@/lib/types";
import type { Result } from "@/lib/brew-validation";

const MAX = 500;
const str = (v: unknown) => (typeof v === "string" ? v : "");

function body(raw: unknown): Result<string> {
  const b = str(raw).trim();
  if (b.length === 0) return { ok: false, error: "Comment cannot be empty." };
  if (b.length > MAX) return { ok: false, error: `Comment must be ${MAX} characters or fewer.` };
  return { ok: true, value: b };
}

export function validateComment(raw: unknown): Result<AddCommentInput> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const tastingId = str(r.tastingId).trim();
  if (!tastingId) return { ok: false, error: "Missing tasting." };
  const b = body(r.body);
  return b.ok ? { ok: true, value: { tastingId, body: b.value } } : b;
}

export function validateUpdateComment(raw: unknown): Result<UpdateCommentInput> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = str(r.id).trim();
  if (!id) return { ok: false, error: "Missing comment id." };
  const b = body(r.body);
  return b.ok ? { ok: true, value: { id, body: b.value } } : b;
}
