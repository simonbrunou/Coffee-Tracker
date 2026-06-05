"use client";
/* ============ Cortado — App Shell ============ */
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { DataProvider } from "./data-context";
import { DiscoverScreen, FeedScreen, JournalScreen } from "./screens";
import { BeanDetail, ProfileScreen, RoasterDetail } from "./detail";
import { LogSheet } from "./log-sheet";
import { Button } from "@/components/ui/button";
import { Avatar, Icon, type IconName } from "./ui";
import { logBrew as logBrewAction, addBag as addBagAction, toggleLike as toggleLikeAction } from "@/app/actions";
import type { AddBagInput, AppData, Bean, LogBrewInput, Tasting } from "@/lib/types";

const NAV: { id: string; label: string; icon: IconName }[] = [
  { id: "feed", label: "Feed", icon: "home" },
  { id: "journal", label: "Journal", icon: "journal" },
  { id: "discover", label: "Discover", icon: "compass" },
  { id: "profile", label: "Profile", icon: "user" },
];

type Route =
  | { name: "feed" | "journal" | "discover" | "profile" }
  | { name: "bean"; beanId: string }
  | { name: "roaster"; roasterId: string };

export default function App({ initialData }: { initialData: AppData }) {
  const { roasters, users, currentUserId } = initialData;

  const [beans, setBeans] = useState<Bean[]>(initialData.beans);
  const [tastings, setTastings] = useState<Tasting[]>(initialData.tastings);
  const [likes, setLikes] = useState<Set<string>>(() => new Set(initialData.likedIds));

  const [route, setRoute] = useState<Route>({ name: "feed" });
  const [feedFilter, setFeedFilter] = useState("Following");
  const [query, setQuery] = useState("");
  const [log, setLog] = useState<{ open: boolean; mode: "brew" | "bag"; preset: string | null }>({
    open: false,
    mode: "brew",
    preset: null,
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  // dark-mode toggle (next-themes); guard against hydration mismatch
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";
  const toggleTheme = () => setTheme(isDark ? "light" : "dark");

  const me = users.find((u) => u.id === currentUserId);

  const go = (name: Route["name"], props: Partial<Route> = {}) => {
    setRoute({ name, ...props } as Route);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const showToast = (msg: string) => toast(msg);

  const toggleLike = (id: string) => {
    const willLike = !likes.has(id);
    setLikes((prev) => {
      const n = new Set(prev);
      if (willLike) n.add(id);
      else n.delete(id);
      return n;
    });
    void toggleLikeAction(id, willLike).catch(() => {});
  };

  // open the logging sheets
  const openBrew = (beanId?: string) => setLog({ open: true, mode: "brew", preset: beanId ?? null });
  const openAddBag = () => setLog({ open: true, mode: "bag", preset: null });
  const closeLog = () => setLog((l) => ({ ...l, open: false }));

  // persist + reflect mutations (server actions can reject if the DB is down —
  // surface a toast rather than silently losing the entry / leaking a rejection)
  const handleLogBrew = async (input: LogBrewInput) => {
    try {
      const t = await logBrewAction(input);
      setTastings((prev) => [t, ...prev]);
      const b = beans.find((x) => x.id === input.beanId);
      showToast(`Logged a ${b ? b.name : "coffee"} brew ✓`);
    } catch {
      showToast("Couldn't log that brew — please try again");
    }
  };

  const handleAddBag = async (input: AddBagInput, backToBrew: boolean) => {
    let bean: Bean;
    try {
      bean = await addBagAction(input);
    } catch {
      closeLog();
      showToast("Couldn't add that bag — please try again");
      return;
    }
    setBeans((prev) => [bean, ...prev]);
    if (backToBrew) setLog({ open: true, mode: "brew", preset: bean.id });
    else {
      closeLog();
      showToast(`${bean.name} added to your shelf ✓`);
    }
  };

  const openBean = (id: string) => go("bean", { beanId: id } as Partial<Route>);
  const openRoaster = (id: string) => go("roaster", { roasterId: id } as Partial<Route>);

  const tab = NAV.find((n) => n.id === route.name) ? route.name : null;

  let screen: React.ReactNode = null;
  if (route.name === "feed")
    screen = (
      <FeedScreen likes={likes} onLike={toggleLike} onOpenBean={openBean} filter={feedFilter} setFilter={setFeedFilter} />
    );
  else if (route.name === "journal")
    screen = (
      <JournalScreen likes={likes} onLike={toggleLike} onOpenBean={openBean} onBrew={openBrew} onAddBag={openAddBag} />
    );
  else if (route.name === "discover")
    screen = <DiscoverScreen onOpenBean={openBean} onOpenRoaster={openRoaster} query={query} setQuery={setQuery} />;
  else if (route.name === "profile")
    screen = <ProfileScreen onOpenBean={openBean} likes={likes} onLike={toggleLike} />;
  else if (route.name === "bean")
    screen = (
      <BeanDetail
        beanId={route.beanId}
        onBack={() => go("feed")}
        onOpenRoaster={openRoaster}
        likes={likes}
        onLike={toggleLike}
        onAdd={openBrew}
      />
    );
  else if (route.name === "roaster")
    screen = <RoasterDetail roasterId={route.roasterId} onBack={() => go("discover")} onOpenBean={openBean} />;

  return (
    <DataProvider
      roasters={roasters}
      users={users}
      beans={beans}
      tastings={tastings}
      currentUserId={currentUserId}
    >
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
              <button key={n.id} onClick={() => go(n.id as Route["name"])} className="nav-item" data-active={tab === n.id}>
                <Icon name={n.icon} size={21} stroke={tab === n.id ? 2 : 1.7} />
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
            <button onClick={() => go("profile")} className="nav-user" style={{ flex: 1, minWidth: 0 }}>
              {me && <Avatar user={me} size={36} />}
              <div style={{ textAlign: "left", minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>You</div>
                <div style={{ fontSize: 11.5, color: "var(--mocha)" }}>@you</div>
              </div>
            </button>
            <ThemeToggle mounted={mounted} isDark={isDark} onToggle={toggleTheme} />
          </div>
        </aside>

        {/* ---- Main scroll area ---- */}
        <main ref={scrollRef} className="main-scroll">
          {/* mobile top bar */}
          <header className="mobile-top">
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <Logo size={30} />
              <span className="display" style={{ fontSize: 18, fontWeight: 700 }}>
                Cortado
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Button variant="ghost" size="icon" onClick={() => go("discover")} aria-label="Search">
                <Icon name="search" size={21} />
              </Button>
              <ThemeToggle mounted={mounted} isDark={isDark} onToggle={toggleTheme} />
            </div>
          </header>
          <div className="screen-pad">{screen}</div>
          <div style={{ height: 90 }} className="mobile-only-spacer" />
        </main>

        {/* ---- Mobile bottom nav ---- */}
        <nav className="bottom-nav">
          {NAV.slice(0, 2).map((n) => (
            <BottomItem key={n.id} n={n} active={tab === n.id} onClick={() => go(n.id as Route["name"])} />
          ))}
          <button onClick={() => openBrew()} className="fab" aria-label="Log a brew">
            <Icon name="drop" size={24} color="var(--cream)" />
          </button>
          {NAV.slice(2).map((n) => (
            <BottomItem key={n.id} n={n} active={tab === n.id} onClick={() => go(n.id as Route["name"])} />
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
    </DataProvider>
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

function ThemeToggle({
  mounted,
  isDark,
  onToggle,
}: {
  mounted: boolean;
  isDark: boolean;
  onToggle: () => void;
}) {
  // Until mounted, render a stable placeholder icon (matches SSR light default)
  // to avoid a hydration mismatch between server and client themes.
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggle}
      aria-label={mounted && isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {mounted ? (
        <Icon name={isDark ? "sun" : "moon"} size={20} />
      ) : (
        <Icon name="moon" size={20} />
      )}
    </Button>
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
