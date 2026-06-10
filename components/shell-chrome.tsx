"use client";
/* ============ Cortado — App shell chrome ============
   The visual chrome around the routed {children}: desktop sidebar, mobile top
   bar, mobile bottom nav, and the verify-email banner. All shared state +
   handlers live in AppProvider (app-provider.tsx); these are presentational and
   receive what they need as props, doing their own routing for nav-only actions
   (settings / login / discover / sign out). */
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar, Icon, type IconName } from "./ui";
import { BrandMark as Logo } from "./brand-mark";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/app/auth-actions";
import { resendVerification } from "@/app/verify-actions";
import type { User } from "@/lib/types";

export const NAV: { id: string; label: string; icon: IconName; href: string }[] = [
  { id: "feed", label: "Feed", icon: "home", href: "/" },
  { id: "journal", label: "Journal", icon: "journal", href: "/journal" },
  { id: "discover", label: "Discover", icon: "compass", href: "/discover" },
  { id: "profile", label: "Profile", icon: "user", href: "/profile" },
];

function ThemeToggle({ mounted, isDark, onToggle }: { mounted: boolean; isDark: boolean; onToggle: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggle}
      aria-label={mounted && isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {mounted && isDark ? <Icon name="sun" size={20} /> : <Icon name="moon" size={20} />}
    </Button>
  );
}

function BottomItem({ n, active }: { n: (typeof NAV)[number]; active: boolean }) {
  return (
    <Link href={n.href} className="bottom-item" data-active={active} aria-current={active ? "page" : undefined}>
      <Icon name={n.icon} size={23} stroke={active ? 2.1 : 1.7} />
      <span>{n.label}</span>
    </Link>
  );
}

type ChromeProps = {
  activeId: string | null;
  mounted: boolean;
  isDark: boolean;
  onToggleTheme: () => void;
};

/** Desktop sidebar: brand, primary nav, the log-a-brew / add-a-bag actions, and
 *  the identity + account-controls footer (or a Sign-in entry for guests). */
export function Sidebar({
  me,
  activeId,
  mounted,
  isDark,
  onToggleTheme,
  onBrew,
  onAddBag,
}: ChromeProps & { me: User | null; onBrew: () => void; onAddBag: () => void }) {
  const router = useRouter();
  return (
    <div className="sidebar">
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "4px 8px 26px" }}>
        <Logo />
        <div>
          <div className="display" style={{ fontSize: "var(--text-xl)", fontWeight: 700, lineHeight: 1 }}>
            Cortado
          </div>
          <div
            className="mono"
            style={{ fontSize: "var(--text-2xs)", letterSpacing: "0.14em", color: "var(--mocha)", textTransform: "uppercase", marginTop: 3 }}
          >
            coffee journal
          </div>
        </div>
      </div>
      <nav aria-label="Primary" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV.map((n) => (
          <Link key={n.id} href={n.href} className="nav-item" data-active={activeId === n.id} aria-current={activeId === n.id ? "page" : undefined}>
            <Icon name={n.icon} size={21} stroke={activeId === n.id ? 2 : 1.7} />
            <span>{n.label}</span>
            {n.id === "feed" && <span className="nav-dot" />}
          </Link>
        ))}
      </nav>
      <div style={{ display: "flex", gap: 8, margin: "20px 0 0" }}>
        <Button onClick={onBrew} style={{ flex: 1 }}>
          <Icon name="drop" size={18} color="currentColor" /> Log a brew
        </Button>
        <Button variant="outline" size="icon" onClick={onAddBag} title="Add a bag to your shelf" aria-label="Add a bag to your shelf">
          <Icon name="plus" size={18} />
        </Button>
      </div>
      <div style={{ marginTop: "auto", paddingTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
        {me ? (
          <>
            {/* Identity gets its OWN full-width row so a long name truncates
                with an ellipsis instead of wrapping into the controls. */}
            <Link href="/profile" className="nav-user">
              <Avatar user={me} size={36} />
              <div style={{ textAlign: "left", minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "var(--text-sm)",
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {me.name}
                </div>
                <div
                  style={{
                    fontSize: "var(--text-xs)",
                    color: "var(--mocha)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  @{me.handle}
                </div>
              </div>
            </Link>
            {/* Controls share a second full-width row, so nothing competes
                with the identity for horizontal space. */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push("/settings")}
                title="Settings"
                aria-label="Settings"
              >
                <Icon name="settings" size={20} />
              </Button>
              <form action={signOutAction}>
                <Button variant="ghost" size="sm" type="submit">Sign out</Button>
              </form>
              <div style={{ marginLeft: "auto" }}>
                <ThemeToggle mounted={mounted} isDark={isDark} onToggle={onToggleTheme} />
              </div>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button variant="outline" onClick={() => router.push("/login")} style={{ flex: 1 }}>
              Sign in
            </Button>
            <ThemeToggle mounted={mounted} isDark={isDark} onToggle={onToggleTheme} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Mobile header (shown below 880px): brand, theme toggle, search, and a Settings
 *  shortcut (the sidebar gear is hidden on mobile) or a guest Sign-in. */
export function MobileTopBar({ currentUserId, mounted, isDark, onToggleTheme }: Omit<ChromeProps, "activeId"> & { currentUserId: string | null }) {
  const router = useRouter();
  return (
    <header className="mobile-top" role="banner">
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <Logo size={30} />
        <span className="display" style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>
          Cortado
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <ThemeToggle mounted={mounted} isDark={isDark} onToggle={onToggleTheme} />
        <Button variant="ghost" size="icon" onClick={() => router.push("/discover")} aria-label="Search">
          <Icon name="search" size={21} />
        </Button>
        {/* Mobile path to Settings (and, from there, Sign-out / account
            actions) — the sidebar gear is hidden below 880px, so mobile
            had no way to reach any of it. */}
        {currentUserId && (
          <Button variant="ghost" size="icon" onClick={() => router.push("/settings")} title="Settings" aria-label="Settings">
            <Icon name="settings" size={21} />
          </Button>
        )}
        {/* Guest entry point for an installed-app launch (the desktop
            sidebar has its own Sign-in; mobile-top had none). Visible
            text gives it an accessible name without an aria-label. */}
        {!currentUserId && (
          <Button variant="outline" size="sm" onClick={() => router.push("/login")}>
            Sign in
          </Button>
        )}
      </div>
    </header>
  );
}

/** Write-gate nudge for credential users with an unverified email. */
export function VerifyBanner() {
  return (
    <div role="status" style={{ background: "var(--cream, #f5ecd9)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", margin: "0 0 14px", display: "flex", alignItems: "center", gap: 12, fontSize: "var(--text-base)" }}>
      <span style={{ flex: 1 }}>Verify your email to log brews and bags. Check your inbox for the link.</span>
      <form action={resendVerification}><Button variant="outline" size="sm" type="submit" className="min-h-11">Resend</Button></form>
    </div>
  );
}

/** Mobile bottom nav: Feed / Journal, the center log-a-brew FAB, Discover / Profile. */
export function MobileBottomNav({ activeId, onBrew }: { activeId: string | null; onBrew: () => void }) {
  return (
    <nav aria-label="Primary (mobile)" className="bottom-nav">
      {NAV.slice(0, 2).map((n) => (
        <BottomItem key={n.id} n={n} active={activeId === n.id} />
      ))}
      <button onClick={onBrew} className="fab" aria-label="Log a brew">
        <Icon name="drop" size={24} color="var(--cream)" />
      </button>
      {NAV.slice(2).map((n) => (
        <BottomItem key={n.id} n={n} active={activeId === n.id} />
      ))}
    </nav>
  );
}
