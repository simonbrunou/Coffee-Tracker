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
import {
  logBrew as logBrewAction,
  addBag as addBagAction,
  toggleLike as toggleLikeAction,
  updateBrew as updateBrewAction,
  deleteBrew as deleteBrewAction,
  updateBag as updateBagAction,
  deleteBag as deleteBagAction,
  toggleFollowUser as followUserAction,
  toggleFollowRoaster as followRoasterAction,
  toggleSaveTasting as saveTastingAction,
  toggleWishlistBean as wishlistBeanAction,
} from "@/app/actions";
import { signOutAction } from "@/app/auth-actions";
import { resendVerification } from "@/app/verify-actions";
import type { AddBagInput, AppData, Bean, LogBrewInput, Tasting, UpdateBagInput, UpdateBrewInput } from "@/lib/types";
import { THEME_LIGHT, THEME_DARK } from "@/lib/theme-colors";

const NAV: { id: string; label: string; icon: IconName; href: string }[] = [
  { id: "feed", label: "Feed", icon: "home", href: "/" },
  { id: "journal", label: "Journal", icon: "journal", href: "/journal" },
  { id: "discover", label: "Discover", icon: "compass", href: "/discover" },
  { id: "profile", label: "Profile", icon: "user", href: "/profile" },
];

interface ShellApi {
  likes: Set<string>;
  toggleLike: (id: string) => void;
  followedUsers: Set<string>;
  followedRoasters: Set<string>;
  savedTastings: Set<string>;
  wishedBeans: Set<string>;
  toggleFollowUser: (id: string) => void;
  toggleFollowRoaster: (id: string) => void;
  toggleSaveTasting: (id: string) => void;
  toggleWishlistBean: (id: string) => void;
  openBean: (id: string) => void;
  openRoaster: (id: string) => void;
  openBrew: (beanId?: string) => void;
  openAddBag: () => void;
  openEditBrew: (t: Tasting) => void;
  deleteBrew: (id: string) => void;
  openEditBag: (beanId: string) => void;
  deleteBag: (beanId: string) => void;
}

const ShellContext = createContext<ShellApi | null>(null);

export function useShell(): ShellApi {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within AppProvider");
  return ctx;
}

export function AppProvider({ initialData, children }: { initialData: AppData; children: React.ReactNode }) {
  const { roasters, currentUserId, needsEmailVerification } = initialData;

  // Server truth is the canonical base: useOptimistic re-bases on `initialData`
  // whenever a Server Action's revalidatePath re-runs the force-dynamic layout.
  // Optimistic updates (in a transition) cover the in-flight latency window, then
  // reconcile to the re-based server value automatically.
  const [myShelf, setMyShelfOptimistic] = useOptimistic(initialData.myShelf, (_state: Bean[], next: Bean[]) => next);
  const [myTastings, setMyTastingsOptimistic] = useOptimistic(
    initialData.myTastings,
    (_state: Tasting[], next: Tasting[]) => next,
  );
  const [likes, setLikes] = useState<Set<string>>(
    () => new Set([...initialData.feed.rows, ...initialData.myTastings].filter((t) => t.likedByMe).map((t) => t.id)),
  );
  const [followedUsers, setFollowedUsers] = useState<Set<string>>(() => new Set(initialData.followedUserIds));
  const [followedRoasters, setFollowedRoasters] = useState<Set<string>>(() => new Set(initialData.followedRoasterIds));
  const [savedTastings, setSavedTastings] = useState<Set<string>>(() => new Set(initialData.savedTastingIds));
  const [wishedBeans, setWishedBeans] = useState<Set<string>>(() => new Set(initialData.wishedBeanIds));
  const [, startTransition] = useTransition();
  const [log, setLog] = useState<{ open: boolean; mode: "brew" | "bag"; preset: string | null }>({
    open: false,
    mode: "brew",
    preset: null,
  });
  // When set, the sheet opens in edit mode pre-populated from this row.
  const [edit, setEdit] = useState<{ kind: "brew"; tasting: Tasting } | { kind: "bag"; bean: Bean } | null>(null);

  const router = useRouter();
  const pathname = usePathname();

  // ---- Scroll restoration for the single persistent scroll container ----
  // The .main-scroll container (a <div>; the <main> landmark is its child) lives
  // in this provider and survives route changes, so we save its position per
  // route and restore it on Back/Forward
  // (popstate); a forward push resets to the top.
  const scrollRef = useRef<HTMLDivElement>(null);
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
    meta.setAttribute("content", isDark ? THEME_DARK : THEME_LIGHT);
  }, [isDark, mounted]);

  const me = initialData.me;

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

  const optimisticToggle = (
    set: Set<string>,
    setSet: (updater: (prev: Set<string>) => Set<string>) => void,
    id: string,
    action: (id: string, on: boolean) => Promise<void>,
    failMsg: string,
  ) => {
    if (!currentUserId) { router.push("/login"); return; }
    // Derive willOn from the freshest state inside the updater (a rapid double-tap
    // must not capture a stale closure value for the action arg / rollback).
    let willOn = false;
    setSet((prev) => { willOn = !prev.has(id); const n = new Set(prev); if (willOn) n.add(id); else n.delete(id); return n; });
    action(id, willOn).catch(() => {
      setSet((prev) => { const n = new Set(prev); if (willOn) n.delete(id); else n.add(id); return n; });
      toast(failMsg);
    });
  };

  const toggleFollowUser = (id: string) => optimisticToggle(followedUsers, setFollowedUsers, id, followUserAction, "Couldn't update follow — try again");
  const toggleFollowRoaster = (id: string) => optimisticToggle(followedRoasters, setFollowedRoasters, id, followRoasterAction, "Couldn't update follow — try again");
  const toggleSaveTasting = (id: string) => optimisticToggle(savedTastings, setSavedTastings, id, saveTastingAction, "Couldn't save — try again");
  const toggleWishlistBean = (id: string) => optimisticToggle(wishedBeans, setWishedBeans, id, wishlistBeanAction, "Couldn't update wishlist — try again");

  const openBrew = (beanId?: string) => {
    if (!currentUserId) return router.push("/login");
    setEdit(null);
    setLog({ open: true, mode: "brew", preset: beanId ?? null });
  };
  const openAddBag = () => {
    if (!currentUserId) return router.push("/login");
    setEdit(null);
    setLog({ open: true, mode: "bag", preset: null });
  };
  const openEditBrew = (t: Tasting) => {
    if (t.userId !== currentUserId) return;
    setEdit({ kind: "brew", tasting: t });
    setLog({ open: true, mode: "brew", preset: t.beanId });
  };
  const openEditBag = (beanId: string) => {
    const b = myShelf.find((x) => x.id === beanId);
    if (!b || b.ownerId !== currentUserId) return;
    setEdit({ kind: "bag", bean: b });
    setLog({ open: true, mode: "bag", preset: null });
  };
  const closeLog = () => {
    setLog((l) => ({ ...l, open: false }));
    setEdit(null);
  };
  const openBean = (id: string) => router.push(`/bean/${id}`);
  const openRoaster = (id: string) => router.push(`/roaster/${id}`);

  // Re-throw on failure so the sheet can show a real error instead of a false
  // success. The new row appears via the action's revalidatePath re-base (proven
  // fast on the spike); the success panel masks the round-trip.
  const handleLogBrew = async (input: LogBrewInput) => {
    const b = myShelf.find((x) => x.id === input.beanId);
    await logBrewAction(input);
    toast(`Logged a ${b ? b.name : "coffee"} brew ✓`);
  };

  const handleAddBag = async (input: AddBagInput, backToBrew: boolean) => {
    const bean = await addBagAction(input);
    // keep the new bag visible in the shelf for the "& continue" → brew hand-off
    startTransition(() => setMyShelfOptimistic([bean, ...myShelf]));
    if (backToBrew) setLog({ open: true, mode: "brew", preset: bean.id });
    else {
      toast(`${bean.name} added to your shelf ✓`);
      setTimeout(closeLog, 1100);
    }
  };

  const handleUpdateBrew = async (input: UpdateBrewInput) => {
    await updateBrewAction(input); // throws → sheet shows the error; revalidate re-bases
    toast("Brew updated ✓");
  };
  const handleDeleteBrew = async (id: string) => {
    // async work INSIDE the transition so useOptimistic auto-reverts the removal
    // if the delete fails (the canonical base still has the row until revalidate).
    startTransition(async () => {
      setMyTastingsOptimistic(myTastings.filter((t) => t.id !== id));
      try {
        await deleteBrewAction(id);
        toast("Brew deleted");
      } catch {
        toast("Couldn't delete that brew — please try again");
      }
    });
  };
  const handleUpdateBag = async (input: UpdateBagInput) => {
    await updateBagAction(input);
    toast("Bag updated ✓");
  };
  const handleDeleteBag = async (beanId: string) => {
    startTransition(async () => {
      setMyShelfOptimistic(myShelf.filter((b) => b.id !== beanId));
      setMyTastingsOptimistic(myTastings.filter((t) => t.beanId !== beanId));
      try {
        await deleteBagAction(beanId);
        toast("Bag and its brews deleted");
        router.push("/journal");
      } catch {
        toast("Couldn't delete that bag — please try again");
      }
    });
  };

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const activeId = NAV.find((n) => isActive(n.href))?.id ?? null;

  const shell: ShellApi = {
    likes,
    toggleLike,
    followedUsers,
    followedRoasters,
    savedTastings,
    wishedBeans,
    toggleFollowUser,
    toggleFollowRoaster,
    toggleSaveTasting,
    toggleWishlistBean,
    openBean,
    openRoaster,
    openBrew,
    openAddBag,
    openEditBrew,
    deleteBrew: handleDeleteBrew,
    openEditBag,
    deleteBag: handleDeleteBag,
  };

  return (
    <DataProvider roasters={roasters} feed={initialData.feed} me={me} myTastings={myTastings} myShelf={myShelf} savedTastings={initialData.savedTastings} wishlistBeans={initialData.wishlistBeans} currentUserId={currentUserId}>
      <ShellContext.Provider value={shell}>
        <div id="app-root" style={{ display: "flex", height: "100%", overflow: "hidden" }}>
          <a href="#main-content" className="skip-link">Skip to content</a>
          {/* ---- Desktop sidebar ---- */}
          <div className="sidebar">
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
            <nav aria-label="Primary" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {NAV.map((n) => (
                <button key={n.id} onClick={() => router.push(n.href)} className="nav-item" data-active={activeId === n.id} aria-current={activeId === n.id ? "page" : undefined}>
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
              <Button variant="outline" size="icon" onClick={() => openAddBag()} title="Add a bag to your shelf" aria-label="Add a bag to your shelf">
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
                </>
              ) : (
                <Button variant="outline" onClick={() => router.push("/login")} style={{ flex: 1 }}>
                  Sign in
                </Button>
              )}
              <ThemeToggle mounted={mounted} isDark={isDark} onToggle={toggleTheme} />
            </div>
          </div>

          {/* ---- Main scroll area ---- */}
          <div ref={scrollRef} className="main-scroll">
            <header className="mobile-top" role="banner">
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
            <main id="main-content" tabIndex={-1} className="screen-pad">
              {needsEmailVerification && (
                <div role="status" style={{ background: "var(--cream, #f5ecd9)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", margin: "0 0 14px", display: "flex", alignItems: "center", gap: 12, fontSize: 14 }}>
                  <span style={{ flex: 1 }}>Verify your email to log brews and bags. Check your inbox for the link.</span>
                  <form action={resendVerification}><Button variant="outline" size="sm" type="submit">Resend</Button></form>
                </div>
              )}
              {children}
            </main>
            <div style={{ height: 90 }} className="mobile-only-spacer" />
          </div>

          {/* ---- Mobile bottom nav ---- */}
          <nav aria-label="Primary (mobile)" className="bottom-nav">
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
            editBrew={edit?.kind === "brew" ? edit.tasting : null}
            onUpdateBrew={async (i) => { await handleUpdateBrew(i); }}
            editBag={edit?.kind === "bag" ? edit.bean : null}
            onUpdateBag={async (i) => { await handleUpdateBag(i); }}
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
    <button onClick={onClick} className="bottom-item" data-active={active} aria-current={active ? "page" : undefined}>
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
