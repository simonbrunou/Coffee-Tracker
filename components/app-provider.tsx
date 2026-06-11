"use client";
/* ============ Cortado — App Provider (shell chrome + shared state) ============
   Mounted once in the root layout so the shared client state (beans, brews,
   likes, the log sheet) survives client-side route navigation. Route pages
   render into {children} and read handlers/state via useShell(). */
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter } from "next/navigation";

// useLayoutEffect on the client (runs before paint / before the browser's
// scroll-clamp event), useEffect on the server to avoid the SSR warning.
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { DataProvider } from "./data-context";
import { LogSheet } from "./log-sheet";
import {
  Sidebar,
  MobileTopBar,
  MobileBottomNav,
  VerifyBanner,
  NAV,
} from "./shell-chrome";
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
import type {
  AddBagInput,
  AppData,
  Bean,
  LogBrewInput,
  Tasting,
  UpdateBagInput,
  UpdateBrewInput,
} from "@/lib/types";
import { THEME_LIGHT, THEME_DARK } from "@/lib/theme-colors";

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
  openUser: (handle: string) => void;
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

export function AppProvider({
  initialData,
  children,
}: {
  initialData: AppData;
  children: React.ReactNode;
}) {
  const { roasters, currentUserId, needsEmailVerification } = initialData;

  // Server truth is the canonical base: useOptimistic re-bases on `initialData`
  // whenever a Server Action's revalidatePath re-runs the force-dynamic layout.
  // Optimistic updates (in a transition) cover the in-flight latency window, then
  // reconcile to the re-based server value automatically.
  const [myShelf, setMyShelfOptimistic] = useOptimistic(
    initialData.myShelf,
    (_state: Bean[], next: Bean[]) => next,
  );
  const [myTastings, setMyTastingsOptimistic] = useOptimistic(
    initialData.myTastings,
    (_state: Tasting[], next: Tasting[]) => next,
  );
  const [likes, setLikes] = useState<Set<string>>(
    () =>
      new Set(
        [...initialData.feed.rows, ...initialData.myTastings]
          .filter((t) => t.likedByMe)
          .map((t) => t.id),
      ),
  );
  const [followedUsers, setFollowedUsers] = useState<Set<string>>(
    () => new Set(initialData.followedUserIds),
  );
  const [followedRoasters, setFollowedRoasters] = useState<Set<string>>(
    () => new Set(initialData.followedRoasterIds),
  );
  const [savedTastings, setSavedTastings] = useState<Set<string>>(
    () => new Set(initialData.savedTastingIds),
  );
  const [wishedBeans, setWishedBeans] = useState<Set<string>>(
    () => new Set(initialData.wishedBeanIds),
  );
  const [, startTransition] = useTransition();
  const [log, setLog] = useState<{
    open: boolean;
    mode: "brew" | "bag";
    preset: string | null;
  }>({
    open: false,
    mode: "brew",
    preset: null,
  });
  // When set, the sheet opens in edit mode pre-populated from this row.
  const [edit, setEdit] = useState<
    { kind: "brew"; tasting: Tasting } | { kind: "bag"; bean: Bean } | null
  >(null);

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
    const onScroll = () =>
      scrollPositions.current.set(currentRouteKey.current, el.scrollTop);
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
    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", isDark ? THEME_DARK : THEME_LIGHT);
  }, [isDark, mounted]);

  const me = initialData.me;

  const optimisticToggle = (
    setSet: (updater: (prev: Set<string>) => Set<string>) => void,
    id: string,
    action: (id: string, on: boolean) => Promise<void>,
    failMsg: string,
  ) => {
    if (!currentUserId) {
      router.push("/login");
      return;
    }
    // Derive willOn from the freshest state inside the updater (a rapid double-tap
    // must not capture a stale closure value for the action arg / rollback).
    let willOn = false;
    setSet((prev) => {
      willOn = !prev.has(id);
      const n = new Set(prev);
      if (willOn) n.add(id);
      else n.delete(id);
      return n;
    });
    action(id, willOn).catch(() => {
      setSet((prev) => {
        const n = new Set(prev);
        if (willOn) n.delete(id);
        else n.add(id);
        return n;
      });
      toast(failMsg);
    });
  };

  const toggleLike = (id: string) =>
    optimisticToggle(
      setLikes,
      id,
      toggleLikeAction,
      "Couldn't save that like — please try again",
    );
  const toggleFollowUser = (id: string) =>
    optimisticToggle(
      setFollowedUsers,
      id,
      followUserAction,
      "Couldn't update follow — try again",
    );
  const toggleFollowRoaster = (id: string) =>
    optimisticToggle(
      setFollowedRoasters,
      id,
      followRoasterAction,
      "Couldn't update follow — try again",
    );
  const toggleSaveTasting = (id: string) =>
    optimisticToggle(
      setSavedTastings,
      id,
      saveTastingAction,
      "Couldn't save — try again",
    );
  const toggleWishlistBean = (id: string) =>
    optimisticToggle(
      setWishedBeans,
      id,
      wishlistBeanAction,
      "Couldn't update wishlist — try again",
    );

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
  const openUser = (handle: string) => router.push(`/u/${handle}`);

  // Re-throw on failure so the sheet can show a real error instead of a false
  // success. The new row appears via the action's revalidatePath re-base (proven
  // fast on the spike); the success panel masks the round-trip.
  const handleLogBrew = async (input: LogBrewInput) => {
    const b = myShelf.find((x) => x.id === input.beanId);
    // Optimistically reduce remaining so the ring updates instantly.
    if (b?.remaining != null && b.bagWeight) {
      const dm = input.dose.match(/^(\d+(?:\.\d+)?)g$/i);
      const bm = b.bagWeight.match(/^(\d+(?:\.\d+)?)g$/i);
      if (dm && bm) {
        const fraction = Number(dm[1]) / Number(bm[1]);
        startTransition(() =>
          setMyShelfOptimistic(
            myShelf.map((s) =>
              s.id === input.beanId
                ? {
                    ...s,
                    remaining: Math.max(0, (s.remaining ?? 1) - fraction),
                  }
                : s,
            ),
          ),
        );
      }
    }
    await logBrewAction(input);
    toast(b ? `Logged your ${b.name} brew ✓` : "Brew logged ✓");
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

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
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
    openUser,
    openBrew,
    openAddBag,
    openEditBrew,
    deleteBrew: handleDeleteBrew,
    openEditBag,
    deleteBag: handleDeleteBag,
  };

  return (
    <DataProvider
      roasters={roasters}
      feed={initialData.feed}
      me={me}
      myTastings={myTastings}
      myShelf={myShelf}
      savedTastings={initialData.savedTastings}
      wishlistBeans={initialData.wishlistBeans}
      currentUserId={currentUserId}
    >
      <ShellContext.Provider value={shell}>
        <div
          id="app-root"
          style={{ display: "flex", height: "100%", overflow: "hidden" }}
        >
          <a href="#main-content" className="skip-link">
            Skip to content
          </a>
          <Sidebar
            me={me}
            activeId={activeId}
            mounted={mounted}
            isDark={isDark}
            onToggleTheme={toggleTheme}
            onBrew={() => openBrew()}
            onAddBag={() => openAddBag()}
          />

          {/* ---- Main scroll area ---- */}
          <div ref={scrollRef} className="main-scroll">
            <MobileTopBar
              currentUserId={currentUserId}
              mounted={mounted}
              isDark={isDark}
              onToggleTheme={toggleTheme}
            />
            <main id="main-content" tabIndex={-1} className="screen-pad">
              {needsEmailVerification && <VerifyBanner />}
              {children}
            </main>
            <div style={{ height: 90 }} className="mobile-only-spacer" />
          </div>

          <MobileBottomNav activeId={activeId} onBrew={() => openBrew()} />

          <LogSheet
            open={log.open}
            mode={log.mode}
            presetBeanId={log.preset}
            onClose={closeLog}
            onLogBrew={handleLogBrew}
            onAddBag={handleAddBag}
            editBrew={edit?.kind === "brew" ? edit.tasting : null}
            onUpdateBrew={async (i) => {
              await handleUpdateBrew(i);
            }}
            editBag={edit?.kind === "bag" ? edit.bean : null}
            onUpdateBag={async (i) => {
              await handleUpdateBag(i);
            }}
          />
        </div>
      </ShellContext.Provider>
    </DataProvider>
  );
}
