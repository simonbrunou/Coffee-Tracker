"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useData } from "./data-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signOutAllDevices, deleteAccount } from "@/app/account-actions";
import { setDiscoverable } from "@/app/profile-actions";
import { linkOAuthStart, unlinkOAuth, setPassword, removePassword } from "@/app/account-link-actions";
import { PASSWORD_MIN_LENGTH } from "@/lib/signup-validation";

type AuthMethods = { hasPassword: boolean; providers: string[] };
const OAUTH = [
  { id: "google", label: "Google" },
  { id: "github", label: "GitHub" },
];

export function SettingsScreen({ discoverable, authMethods }: { discoverable: boolean; authMethods: AuthMethods }) {
  const D = useData();
  const handle = D.me?.handle ?? "";
  const [confirm, setConfirm] = useState("");
  const [armed, setArmed] = useState(false);
  const [deletePw, setDeletePw] = useState("");

  const router = useRouter();
  const params = useSearchParams();
  const linkNote =
    params.get("linked") ? "Account connected." :
    params.get("linkError") === "taken" ? "That account is already linked to another Cortado account." :
    params.get("linkError") === "expired" ? "That link expired — please try again." : "";
  const methodCount = (authMethods.hasPassword ? 1 : 0) + authMethods.providers.length;
  const [pw, setPw] = useState("");
  // Current password, re-confirmed before any sign-in-method change or deletion (L3).
  const [confirmPw, setConfirmPw] = useState("");
  const [err, setErr] = useState("");
  // Run a removal/add action; show its error, else refresh the server-fetched state.
  const run = async (fn: () => Promise<{ error: string }>) => {
    const r = await fn();
    if (r.error) setErr(r.error);
    else { setErr(""); setPw(""); setConfirmPw(""); router.refresh(); }
  };
  // Credential users must type their current password to confirm destructive changes.
  const needsReauth = authMethods.hasPassword;
  const reauthReady = !needsReauth || confirmPw.length > 0;
  const canDelete = handle.length > 0 && confirm.trim() === handle && (!needsReauth || deletePw.length > 0);
  const [deleteErr, setDeleteErr] = useState("");
  const onDelete = async () => {
    // On success deleteAccount throws the Next redirect; only a failed re-auth returns.
    const r = await deleteAccount(needsReauth ? deletePw : undefined);
    if (r?.error) setDeleteErr(r.error);
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
      <h1 className="display" style={{ fontSize: 26, fontWeight: 700 }}>Settings</h1>

      <section style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 18 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Sign-in methods</h2>
        <p style={{ color: "var(--mocha)", fontSize: 14, marginBottom: 14 }}>
          Connect or remove ways to sign in. You must keep at least one.
        </p>
        {(linkNote || err) && (
          <p role="status" style={{ fontSize: 13.5, color: "var(--caramel-deep)", marginBottom: 12 }}>{err || linkNote}</p>
        )}
        {needsReauth && (
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="confirm-pw" style={{ display: "block", fontSize: 13.5, marginBottom: 4 }}>
              Current password <span style={{ color: "var(--mocha)" }}>— required to remove or disconnect a method</span>
            </label>
            <Input
              id="confirm-pw"
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Your current password"
              autoComplete="current-password"
              style={{ maxWidth: 280 }}
            />
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Password</span>
            {authMethods.hasPassword ? (
              <Button variant="outline" size="sm" disabled={methodCount <= 1 || !reauthReady} onClick={() => run(() => removePassword(confirmPw))}>
                Remove
              </Button>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                <Input type="password" aria-label="New password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" autoComplete="new-password" style={{ width: 180 }} />
                <Button size="sm" disabled={pw.length < PASSWORD_MIN_LENGTH} onClick={() => run(() => setPassword(pw))}>Add</Button>
              </div>
            )}
          </div>
          {OAUTH.map((p) => {
            const linked = authMethods.providers.includes(p.id);
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{p.label}</span>
                {linked ? (
                  <Button variant="outline" size="sm" disabled={methodCount <= 1 || !reauthReady} onClick={() => run(() => unlinkOAuth(p.id, confirmPw))}>
                    Disconnect
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => { linkOAuthStart(p.id).catch(() => setErr("Couldn't start connecting. Please try again.")); }}>Connect</Button>
                )}
              </div>
            );
          })}
        </div>
      </section>

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
            {needsReauth && (
              <>
                <label htmlFor="confirm-delete-pw" style={{ fontSize: 13.5 }}>
                  Enter your current password:
                </label>
                <Input
                  id="confirm-delete-pw"
                  type="password"
                  value={deletePw}
                  onChange={(e) => setDeletePw(e.target.value)}
                  placeholder="Your current password"
                  autoComplete="current-password"
                />
              </>
            )}
            {deleteErr && (
              <p role="alert" style={{ fontSize: 13.5, color: "var(--destructive, #b24a44)" }}>{deleteErr}</p>
            )}
            <Button variant="destructive" disabled={!canDelete} onClick={onDelete}>
              Permanently delete account
            </Button>
          </div>
        )}
      </section>

      <section style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 18 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Public profile</h2>
        <p style={{ color: "var(--mocha)", fontSize: 14, marginBottom: 14 }}>
          Your profile lives at <a href={`/u/${handle}`} style={{ color: "var(--espresso)", fontWeight: 600 }}>/u/{handle}</a>{" "}
          and is viewable by anyone with the link.{" "}
          {discoverable ? "Search engines may index it." : "Search engines are asked not to index it."}
        </p>
        <form action={setDiscoverable.bind(null, !discoverable)}>
          <Button type="submit" variant="outline">
            {discoverable ? "Make profile non-indexable" : "Let search engines index my profile"}
          </Button>
        </form>
      </section>

      <section style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 18 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Your data</h2>
        <p style={{ color: "var(--mocha)", fontSize: 14, marginBottom: 14 }}>
          Download a copy of your account data — profile, brews, bags, comments, and follows — as a JSON file.
        </p>
        <Button asChild variant="outline">
          <a href="/api/export" download="cortado-data.json">Download my data</a>
        </Button>
      </section>

      <section style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 18 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>Legal</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
          <a href="/privacy" style={{ color: "var(--espresso)", fontWeight: 600 }}>Privacy Policy</a>
          <a href="/terms" style={{ color: "var(--espresso)", fontWeight: 600 }}>Terms of Service</a>
          <a href="/cookies" style={{ color: "var(--espresso)", fontWeight: 600 }}>Cookie Notice</a>
        </div>
      </section>
    </div>
  );
}
