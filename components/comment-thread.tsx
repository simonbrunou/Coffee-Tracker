"use client";
import { useEffect, useState } from "react";
import { useData } from "./data-context";
import { useShell } from "./app-provider";
import { relativeTime } from "@/lib/relative-time";
import { fetchComments, addComment, updateComment, deleteComment } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Comment } from "@/lib/types";

export function CommentThread({ tastingId }: { tastingId: string }) {
  const D = useData();
  const me = D.currentUserId;
  const meUser = D.me ?? undefined;
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
    const temp: Comment = {
      id: `temp-${crypto.randomUUID()}`, tastingId, userId: me, body,
      createdAt: new Date().toISOString(), updatedAt: null,
      authorName: meUser?.name ?? "You", authorHandle: meUser?.handle ?? "", authorAvatar: meUser?.avatar ?? "#8a6f4e",
    };
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
    let removed: Comment | undefined;
    setList((l) => { removed = (l ?? []).find((c) => c.id === id); return (l ?? []).filter((c) => c.id !== id); });
    try {
      await deleteComment(id);
    } catch {
      // re-insert (functional updater — don't restore a stale whole-list snapshot)
      if (removed) setList((l) => [...(l ?? []), removed!].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)));
    }
  };

  if (list === null) return <div style={{ padding: "8px 16px", fontSize: "var(--text-sm)", color: "var(--mocha)" }}>Loading comments…</div>;

  return (
    <div style={{ padding: "4px 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      {list.map((c) => (
        <CommentRow key={c.id} c={c} mine={c.userId === me} onDelete={() => remove(c.id)}
          onEdit={async (body) => { const real = await updateComment({ id: c.id, body }); setList((l) => (l ?? []).map((x) => (x.id === c.id ? real : x))); }} />
      ))}
      {me ? (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1} placeholder="Add a comment…"
            className="resize-y rounded-[var(--r-md)] border-[var(--line)] bg-[var(--surface)] text-[length:var(--text-base)]" />
          <Button onClick={submit} disabled={!draft.trim() || pending}>{pending ? "…" : "Post"}</Button>
        </div>
      ) : (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--mocha)" }}>Sign in to comment.</div>
      )}
      {error && <div role="alert" style={{ fontSize: "var(--text-xs)", color: "var(--berry)" }}>{error}</div>}
    </div>
  );
}

function CommentRow({ c, mine, onDelete, onEdit }: {
  c: Comment; mine: boolean;
  onDelete: () => void; onEdit: (body: string) => Promise<void>;
}) {
  const shell = useShell();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(c.body);
  return (
    <div style={{ fontSize: "var(--text-sm)", lineHeight: 1.5 }}>
      <button type="button" onClick={() => shell.openUser(c.authorHandle)} style={{ fontWeight: 600, color: "inherit", font: "inherit" }}>
        {c.authorName}
      </button>{" "}
      <span style={{ color: "var(--mocha)", fontSize: "var(--text-xs)" }}>· {relativeTime(c.createdAt)}{c.updatedAt ? " · edited" : ""}</span>
      {editing ? (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <Textarea value={val} onChange={(e) => setVal(e.target.value)} rows={1} className="text-[length:var(--text-sm)]" />
          <Button size="sm" onClick={async () => { await onEdit(val.trim()); setEditing(false); }} disabled={!val.trim()}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => { setVal(c.body); setEditing(false); }}>Cancel</Button>
        </div>
      ) : (
        <div style={{ color: "var(--coffee)" }}>{c.body}</div>
      )}
      {mine && !editing && (
        <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
          <Button size="sm" variant="ghost" className="h-auto p-0 text-[length:var(--text-xs)]" onClick={() => setEditing(true)}>Edit</Button>
          <Button size="sm" variant="ghost" className="h-auto p-0 text-[length:var(--text-xs)]" onClick={onDelete}>Delete</Button>
        </div>
      )}
    </div>
  );
}
