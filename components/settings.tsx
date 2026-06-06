"use client";
import { useState } from "react";
import { useData } from "./data-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signOutAllDevices, deleteAccount } from "@/app/account-actions";

export function SettingsScreen() {
  const D = useData();
  const handle = D.me?.handle ?? "";
  const [confirm, setConfirm] = useState("");
  const [armed, setArmed] = useState(false);
  const canDelete = handle.length > 0 && confirm.trim() === handle;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
      <h1 className="display" style={{ fontSize: 26, fontWeight: 700 }}>Settings</h1>

      <section style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 18 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Sign out everywhere</h2>
        <p style={{ color: "var(--mocha)", fontSize: 14, marginBottom: 14 }}>
          Sign out of every device, including this one. Other sessions lose access on their next request.
        </p>
        <form action={signOutAllDevices}>
          <Button type="submit" variant="outline">Sign out everywhere</Button>
        </form>
      </section>

      <section style={{ border: "1px solid var(--destructive, #b24a44)", borderRadius: 14, padding: 18 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Delete account</h2>
        <p style={{ color: "var(--mocha)", fontSize: 14, marginBottom: 14 }}>
          Permanently delete your account and all your brews, bags, likes, comments, and follows.
          This cannot be undone.
        </p>
        {!armed ? (
          <Button variant="outline" onClick={() => setArmed(true)}>Delete my account…</Button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label htmlFor="confirm-handle" style={{ fontSize: 13.5 }}>
              Type your handle <strong>@{handle}</strong> to confirm:
            </label>
            <Input
              id="confirm-handle"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={handle}
              autoComplete="off"
            />
            <form action={deleteAccount}>
              <Button type="submit" variant="destructive" disabled={!canDelete}>
                Permanently delete account
              </Button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
