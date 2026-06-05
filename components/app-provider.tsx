"use client";
/* ============ Cortado — App Provider (shell chrome + shared state) ============
   Mounted once in the root layout so the shared client state (beans, brews,
   likes, the log sheet) survives client-side route navigation. Route pages
   render into {children} and read handlers/state via useShell(). */
import { createContext, useContext, useEffect, useLayoutEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

// useLayoutEffect on the client (runs before paint / before the browser's
// scroll-clamp event), useEffect on the server to avoid the SSR warning.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { DataProvider } from "./data-context";
import { LogSheet } from "./log-sheet";
import { Avatar, Icon, type IconName } from "./ui";
import { Button } from "@/components/ui/button";
import { logBrew as logBrewAction, addBag as addBagAction, toggleLike as toggleLikeAction } from "@/app/actions";
import { signOutAction } from "@/app/auth-actions";
import type { AddBagInput, AppData, Bean, LogBrewInput, Tasting } from "@/lib/types";

const NAV: { id: string; label: string; icon: IconName; href: string }[] = [
  { id: "feed", label: "Feed", icon: "home", href: "/" },
  { id: "journal", label: "Journal", icon: "journal", href: "/journal" },
  { id: "discover", label: "Discover", icon: "compass", href: "/discover" },
  { id: "profile", label: "Profile", icon: "user", href: "/profile" },
];

interface ShellApi {
  likes: Set<string>;
  toggleLike: (id: string) => void;
  openBean: (id: string) => void;
  openRoaster: (id: string) => void;
  openBrew: (beanId?: string) => void;
  openAddBag: () => void;
}

const ShellContext = createContext<ShellApi | null>(null);

export function useShell(): ShellApi {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within AppProvider");
  return ctx;
}

export function AppProvider({ initialData, children }: { initialData: AppData; children: React.ReactNode }) {
  const { roasters, users, currentUserId } = initialData;

  // Server truth is the canonical base: useOptimistic re-bases on `initialData`
  // whenever a Server Action's revalidatePath re-runs the force-dynamic layout.
  // Optimistic updates (in a transition) cover the in-flight latency window, then
  // reconcile to the re-based server value automatically.
  const [beans, setBeansOptimistic] = useOptimistic(initialData.beans, (_state: Bean[], next: Bean[]) => next);
  const [tastings, setTastingsOptimistic] = useOptimistic(
    initialData.tastings,
    (_state: Tasting[], next: Tasting[]) => next,
  );
  const [likes, setLikes] = useState<Set<string>>(
    () => new Set(initialData.tastings.filter((t) => t.likedByMe).map((t) => t.id)),
  );
  const [, startTransition] = useTransition();
  const [log, setLog] = useState<{ open: boolean; mode: "brew" | "bag"; preset: string | null }>({
    open: false,
    mode: "brew",
    preset: null,
  });

  const router = useRouter();
  const pathname = usePathname();

  // ---- Scroll restoration for the single persistent scroll container ----
  // The <main> scroll container lives in this provider and survives route
  // changes, so we save its position per route and restore it on Back/Forward
  // (popstate); a forward push resets to the top.
  const scrollRef = useRef<HTMLElement>(null);
  const scrollPositions = useRef<Map<string, number>>(new Map());
  const currentRouteKey = useRef(pathname);
  const isPopNav = useRef(false);
  useEffect(() => {
    const onPop = () => {
      isPopNav.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => scrollPositions.current.set(currentRouteKey.current, el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  // Layout effect so currentRouteKey switches to the new route BEFORE the
  // browser dispatches the scroll-clamp event from the content swap — otherwise
  // that event would save the clamped value under the route we just left.
  useIsoLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const saved = scrollPositions.current.get(pathname);
    if (isPopNav.current && saved != null) el.scrollTop = saved;
    else {
      el.scrollTop = 0;
      scrollPositions.current.set(pathname, 0);
    }
    isPopNav.current = false;
    currentRouteKey.current = pathname;
  }, [pathname]);

  // dark-mode toggle (next-themes); guard against hydration mismatch
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";
  const toggleTheme = () => setTheme(isDark ? "light" : "dark");

  // Keep the mobile browser-chrome theme-color in sync with the *active in-app*
  // theme (next-themes is class-based, so a static prefers-color-scheme meta
  // would disagree when the user toggles against their OS preference).
  useEffect(() => {
    if (!mounted) return;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", isDark ? "#1b1610" : "#f4ece1");
  }, [isDark, mounted]);

  const me = users.find((u) => u.id === currentUserId);

  const toggleLike = (id: string) => {
    if (!currentUserId) { router.push("/login"); return; }
    const willLike = !likes.has(id);
    setLikes((prev) => {
      const n = new Set(prev);
      if (willLike) n.add(id);
      else n.delete(id);
      return n;
    });
    // persist; on failure roll the optimistic update back and surface it
    toggleLikeAction(id, willLike).catch(() => {
      setLikes((prev) => {
        const n = new Set(prev);
        if (willLike) n.delete(id);
        else n.add(id);
        return n;
      });
      toast("Couldn't save that like — please try again");
    });
  };

  const openBrew = (beanId?: string) => {
    if (!currentUserId) return router.push("/login");
    setLog({ open: true, mode: "brew", preset: beanId ?? null });
  };
  const openAddBag = () => {
    if (!currentUserId) return router.push("/login");
    setLog({ open: true, mode: "bag", preset: null });
  };
  const closeLog = () => setLog((l) => ({ ...l, open: false }));
  const openBean = (id: string) => router.push(`/bean/${id}`);
  const openRoaster = (id: string) => router.push(`/roaster/${id}`);

  // Re-throw on failure so the sheet can show a real error instead of a false
  // success. The new row appears via the action's revalidatePath re-base (proven
  // fast on the spike); the success panel masks the round-trip.
  const handleLogBrew = async (input: LogBrewInput) => {
    const b = beans.find((x) => x.id === input.beanId);
    await logBrewAction(input);
    toast(`Logged a ${b ? b.name : "coffee"} brew ✓`);
  };

  const handleAddBag = async (input: AddBagInput, backToBrew: boolean) => {
    const bean = await addBagAction(input);
    // keep the new bag visible in the shelf for the "& continue" → brew hand-off
    startTransition(() => setBeansOptimistic([bean, ...beans]));
    if (backToBrew) setLog({ open: true, mode: "brew", preset: bean.id });
    else {
      toast(`${bean.name} added to your shelf ✓`);
      setTimeout(closeLog, 1100);
    }
  };

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const activeId = NAV.find((n) => isActive(n.href))?.id ?? null;

  const shell: ShellApi = {
    likes,
    toggleLike,
    openBean,
    openRoaster,
    openBrew,
    openAddBag,
  };

  return (
    <DataProvider roasters={roasters} users={users} beans={beans} tastings={tastings} currentUserId={currentUserId}>
      <ShellContext.Provider value={shell}>
        <div id="app-root" style={{ display: "flex", height: "100%", overflow: "hidden" }}>
          {/* ---- Desktop sidebar ---- */}
          <aside className="sidebar">
            <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "4px 8px 26px" }}>
              <Logo />
              <div>
                <div className="display" style={{ fontSize: 19, fontWeight: 700, lineHeight: 1 }}>
                  Cortado
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 9.5, letterSpacing: "0.14em", color: "var(--mocha)", textTransform: "uppercase", marginTop: 3 }}
                >
                  coffee journal
                </div>
              </div>
            </div>
            <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {NAV.map((n) => (
                <button key={n.id} onClick={() => router.push(n.href)} className="nav-item" data-active={activeId === n.id}>
                  <Icon name={n.icon} size={21} stroke={activeId === n.id ? 2 : 1.7} />
                  <span>{n.label}</span>
                  {n.id === "feed" && <span className="nav-dot" />}
                </button>
              ))}
            </nav>
            <div style={{ display: "flex", gap: 8, margin: "20px 0 0" }}>
              <Button onClick={() => openBrew()} style={{ flex: 1 }}>
                <Icon name="drop" size={18} color="currentColor" /> Log a brew
              </Button>
              <Button variant="outline" size="icon" onClick={() => openAddBag()} title="Add a bag to your shelf">
                <Icon name="plus" size={18} />
              </Button>
            </div>
            <div style={{ marginTop: "auto", paddingTop: 20, display: "flex", alignItems: "center", gap: 8 }}>
              {me ? (
                <>
                  <button onClick={() => router.push("/profile")} className="nav-user" style={{ flex: 1, minWidth: 0 }}>
                    <Avatar user={me} size={36} />
                    <div style={{ textAlign: "left", minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{me.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--mocha)" }}>@{me.handle}</div>
                    </div>
                  </button>
                  <form action={signOutAction}>
                    <Button variant="ghost" size="sm" type="submit">Sign out</Button>
                  </form>
                </>
              ) : (
                <Button variant="outline" onClick={() => router.push("/login")} style={{ flex: 1 }}>
                  Sign in
                </Button>
              )}
              <ThemeToggle mounted={mounted} isDark={isDark} onToggle={toggleTheme} />
            </div>
          </aside>

          {/* ---- Main scroll area ---- */}
          <main ref={scrollRef} className="main-scroll">
            <header className="mobile-top">
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <Logo size={30} />
                <span className="display" style={{ fontSize: 18, fontWeight: 700 }}>
                  Cortado
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <ThemeToggle mounted={mounted} isDark={isDark} onToggle={toggleTheme} />
                <Button variant="ghost" size="icon" onClick={() => router.push("/discover")} aria-label="Search">
                  <Icon name="search" size={21} />
                </Button>
              </div>
            </header>
            <div className="screen-pad">{children}</div>
            <div style={{ height: 90 }} className="mobile-only-spacer" />
          </main>

          {/* ---- Mobile bottom nav ---- */}
          <nav className="bottom-nav">
            {NAV.slice(0, 2).map((n) => (
              <BottomItem key={n.id} n={n} active={activeId === n.id} onClick={() => router.push(n.href)} />
            ))}
            <button onClick={() => openBrew()} className="fab" aria-label="Log a brew">
              <Icon name="drop" size={24} color="var(--cream)" />
            </button>
            {NAV.slice(2).map((n) => (
              <BottomItem key={n.id} n={n} active={activeId === n.id} onClick={() => router.push(n.href)} />
            ))}
          </nav>

          <LogSheet
            open={log.open}
            mode={log.mode}
            presetBeanId={log.preset}
            onClose={closeLog}
            onLogBrew={handleLogBrew}
            onAddBag={handleAddBag}
          />
        </div>
      </ShellContext.Provider>
    </DataProvider>
  );
}

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

function BottomItem({
  n,
  active,
  onClick,
}: {
  n: { id: string; label: string; icon: IconName };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="bottom-item" data-active={active}>
      <Icon name={n.icon} size={23} stroke={active ? 2.1 : 1.7} />
      <span>{n.label}</span>
    </button>
  );
}

function Logo({ size = 38 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--espresso)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none">
        <ellipse cx="12" cy="12" rx="7" ry="10" transform="rotate(35 12 12)" fill="var(--caramel)" />
        <path d="M 7 6 Q 12 12 17 18" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}
