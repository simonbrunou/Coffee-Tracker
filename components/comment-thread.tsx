"use client";
import { useEffect, useState } from "react";
import { useData } from "./data-context";
import { relativeTime } from "@/lib/relative-time";
import { fetchComments, addComment, updateComment, deleteComment } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Comment } from "@/lib/types";

export function CommentThread({ tastingId }: { tastingId: string }) {
  const D = useData();
  const me = D.currentUserId;
  const [list, setList] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchComments(tastingId).then(setList).catch(() => setList([])); }, [tastingId]);

  const submit = async () => {
    const body = draft.trim();
    if (!body || pending) return;
    if (!me) return;
    setPending(true); setError(null);
    const temp: Comment = { id: `temp-${tastingId}-${body.length}`, tastingId, userId: me, body, createdAt: new Date().toISOString(), updatedAt: null };
    setList((l) => [...(l ?? []), temp]);
    try {
      const real = await addComment({ tastingId, body });
      setList((l) => (l ?? []).map((c) => (c.id === temp.id ? real : c)));
      setDraft("");
    } catch (e) {
      setList((l) => (l ?? []).filter((c) => c.id !== temp.id));
      setError(e instanceof Error ? e.message : "Couldn't post that comment.");
    } finally {
      setPending(false);
    }
  };

  const remove = async (id: string) => {
    const prev = list;
    setList((l) => (l ?? []).filter((c) => c.id !== id));
    try { await deleteComment(id); } catch { setList(prev); }
  };

  if (list === null) return <div style={{ padding: "8px 16px", fontSize: 13, color: "var(--mocha)" }}>Loading comments…</div>;

  return (
    <div style={{ padding: "4px 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      {list.map((c) => (
        <CommentRow key={c.id} c={c} mine={c.userId === me} user={D.user(c.userId)} onDelete={() => remove(c.id)}
          onEdit={async (body) => { const real = await updateComment({ id: c.id, body }); setList((l) => (l ?? []).map((x) => (x.id === c.id ? real : x))); }} />
      ))}
      {me ? (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1} placeholder="Add a comment…"
            className="resize-y rounded-[var(--r-md)] border-[var(--line)] bg-[var(--surface)] text-[14px]" />
          <Button onClick={submit} disabled={!draft.trim() || pending}>{pending ? "…" : "Post"}</Button>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--mocha)" }}>Sign in to comment.</div>
      )}
      {error && <div role="alert" style={{ fontSize: 12.5, color: "var(--berry, #a8434a)" }}>{error}</div>}
    </div>
  );
}

function CommentRow({ c, mine, user, onDelete, onEdit }: {
  c: Comment; mine: boolean; user: ReturnType<ReturnType<typeof useData>["user"]>;
  onDelete: () => void; onEdit: (body: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(c.body);
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
      <span style={{ fontWeight: 600 }}>{user?.name ?? "Someone"}</span>{" "}
      <span style={{ color: "var(--mocha)", fontSize: 12 }}>· {relativeTime(c.createdAt)}{c.updatedAt ? " · edited" : ""}</span>
      {editing ? (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <Textarea value={val} onChange={(e) => setVal(e.target.value)} rows={1} className="text-[13.5px]" />
          <Button size="sm" onClick={async () => { await onEdit(val.trim()); setEditing(false); }} disabled={!val.trim()}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => { setVal(c.body); setEditing(false); }}>Cancel</Button>
        </div>
      ) : (
        <div style={{ color: "var(--coffee)" }}>{c.body}</div>
      )}
      {mine && !editing && (
        <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
          <Button size="sm" variant="ghost" className="h-auto p-0 text-[12px]" onClick={() => setEditing(true)}>Edit</Button>
          <Button size="sm" variant="ghost" className="h-auto p-0 text-[12px]" onClick={onDelete}>Delete</Button>
        </div>
      )}
    </div>
  );
}
