"use client";
/* ============ Cortado — Screens (Feed, Journal, Discover) ============ */
import { useState, useEffect } from "react";
import { useData } from "./data-context";
import { BeanCard, BeanBag, TastingCard } from "./cards";
import { useShell } from "./app-provider";
import { useLoadMore } from "./use-load-more";
import { loadMoreFeed, loadMoreBeans } from "@/app/actions";
import { BeanGlyph, BeanRating, Icon, Placeholder, RelTime, staggerMs } from "./ui";
import type { IconName } from "./ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Bean, Page, Roaster, Tasting } from "@/lib/types";

// ---------- Section header ----------
export function ScreenHead({
  kicker,
  title,
  sub,
  action,
}: {
  kicker?: string;
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 22,
        flexWrap: "wrap",
      }}
    >
      <div>
        {kicker && (
          <div
            className="mono"
            style={{
              fontSize: "var(--text-2xs)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--caramel-deep)",
              marginBottom: 8,
            }}
          >
            {kicker}
          </div>
        )}
        <h1
          className="display"
          style={{ fontSize: "var(--text-4xl)", fontWeight: 600, lineHeight: 1.05, letterSpacing: "-0.01em" }}
        >
          {title}
        </h1>
        {sub && (
          <p
            style={{
              fontSize: "var(--text-base)",
              color: "var(--mocha)",
              marginTop: 8,
              maxWidth: 460,
              textWrap: "pretty",
            }}
          >
            {sub}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

// ---------- FEED ----------
export function FeedScreen({
  likes,
  onLike,
  onOpenBean,
  filter,
  setFilter,
}: {
  likes: Set<string>;
  onLike: (id: string) => void;
  onOpenBean: (id: string) => void;
  filter: string;
  setFilter: (f: string) => void;
}) {
  const D = useData();
  const { openBrew } = useShell();
  const tabs = ["Recent", "Following", "Popular"];
  // Recent page 1 ships in the server payload (D.feed); load-more + other tabs
  // fetch keyset pages via the loadMoreFeed action (M3·D).
  const { rows, loadMore, hasMore, pending, reset } = useLoadMore<Tasting>(D.feed, (c) => loadMoreFeed(filter, c));
  const [tabLoading, setTabLoading] = useState(false);
  useEffect(() => {
    let active = true;
    if (filter === "Recent") {
      reset(D.feed);
      return;
    }
    setTabLoading(true);
    loadMoreFeed(filter, null)
      .then((p) => { if (active) reset(p); })
      .catch(() => { if (active) reset({ rows: [], nextCursor: null }); })
      .finally(() => { if (active) setTabLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, D.feed]);
  const sub =
    filter === "Following"
      ? "Fresh tastings from the people you follow."
      : filter === "Popular"
        ? "The most-loved brews on Cortado right now."
        : "The latest brews across Cortado.";
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <ScreenHead kicker="Your daily pour" title="The Feed" sub={sub} />
      <div role="group" aria-label="Filter feed" style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {tabs.map((t) => {
          const active = filter === t;
          return (
            <button
              key={t}
              onClick={() => setFilter(t)}
              aria-pressed={active}
              style={{
                padding: "8px 16px",
                borderRadius: 99,
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                background: active ? "var(--espresso)" : "var(--surface)",
                color: active ? "var(--cream)" : "var(--coffee)",
                border: "1px solid " + (active ? "var(--espresso)" : "var(--line)"),
                transition: "all 0.15s",
              }}
            >
              {t}
            </button>
          );
        })}
      </div>
      {tabLoading ? (
        <div
          style={{ textAlign: "center", padding: "48px 20px", color: "var(--mocha)", fontSize: "var(--text-base)" }}
        >
          Loading…
        </div>
      ) : filter === "Following" && rows.length === 0 ? (
        <FeedEmpty
          icon="user"
          title="You're not following anyone yet"
          hint="Find people and roasters to follow over on Discover."
        />
      ) : rows.length === 0 ? (
        <FeedEmpty
          icon="drop"
          title="Your feed is brewing"
          hint="Log your first brew and it'll appear here — alongside tastings from people you follow."
          cta={{ label: "Log your first brew", onClick: () => openBrew() }}
        />
      ) : (
        <>
          <div role="list" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {rows.map((t, i) => (
              <div role="listitem" key={t.id}>
                <TastingCard
                  tasting={t}
                  delay={i * 50}
                  onOpenBean={onOpenBean}
                  onLike={onLike}
                  liked={likes.has(t.id)}
                />
              </div>
            ))}
          </div>
          {hasMore && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 22 }}>
              <Button variant="outline" onClick={loadMore} disabled={pending}>
                {pending ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Empty state for feed tabs (e.g. a brand-new Feed, or Following with no follows yet).
function FeedEmpty({
  title,
  hint,
  icon = "user",
  cta,
}: {
  title: string;
  hint: string;
  icon?: IconName;
  cta?: { label: string; onClick: () => void };
}) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--mocha)" }}>
      <div style={{ display: "inline-flex", marginBottom: 14, opacity: 0.5 }}>
        <Icon name={icon} size={40} />
      </div>
      <p style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--coffee)" }}>{title}</p>
      <p style={{ fontSize: "var(--text-base)", marginTop: 6, maxWidth: 360, marginInline: "auto" }}>{hint}</p>
      {cta && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
          <Button onClick={cta.onClick}>
            <Icon name="drop" size={17} color="currentColor" /> {cta.label}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------- JOURNAL ----------
export function JournalScreen({
  likes,
  onLike,
  onOpenBean,
  onBrew,
  onAddBag,
}: {
  likes: Set<string>;
  onLike: (id: string) => void;
  onOpenBean: (id: string) => void;
  onBrew: (beanId?: string) => void;
  onAddBag: () => void;
}) {
  const D = useData();
  const mine = D.myTastings;
  const [section, setSection] = useState<"brews" | "shelf" | "saved">("brews");
  const [view, setView] = useState<"timeline" | "grid">("timeline");
  const shelf = D.myShelf;
  // Server-scoped saved/wishlist, filtered by the optimistic Sets so an un-save
  // hides instantly (a new save appears after the action's revalidate).
  const { savedTastings: savedSet, wishedBeans: wishedSet } = useShell();
  const savedTastings = D.savedTastings.filter((t) => savedSet.has(t.id));
  const wishlistedBeans = D.wishlistBeans.filter((b) => wishedSet.has(b.id));
  const avg = mine.length ? (mine.reduce((s, t) => s + t.rating, 0) / mine.length).toFixed(1) : "0.0";
  const beansLogged = new Set(mine.map((t) => t.beanId)).size;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <ScreenHead
        kicker="Just for you"
        title="My Journal"
        sub="Your shelf of bags, and every brew you've pulled from them."
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="outline" onClick={onAddBag}>
              <Icon name="plus" size={17} /> Add bag
            </Button>
            <Button onClick={() => onBrew()}>
              <Icon name="drop" size={17} color="currentColor" /> Log a brew
            </Button>
          </div>
        }
      />

      {/* stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 12,
          marginBottom: 26,
        }}
      >
        <Stat big={mine.length} label="Brews logged" />
        <Stat big={shelf.length} label="Bags on shelf" />
        <Stat big={avg} label="Avg rating" icon />
        <Stat big={beansLogged} label="Beans tasted" />
      </div>

      {/* section toggle */}
      <div
        role="group"
        aria-label="Journal section"
        style={{ display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid var(--line-soft)" }}
      >
        {(
          [
            ["brews", "Brews"],
            ["shelf", "My Shelf"],
            ["saved", "Saved"],
          ] as const
        ).map(([k, lbl]) => {
          const active = section === k;
          const count = k === "shelf" ? shelf.length : k === "saved" ? savedTastings.length + wishlistedBeans.length : null;
          return (
            <button
              key={k}
              onClick={() => setSection(k)}
              aria-pressed={active}
              style={{
                padding: "10px 4px",
                marginBottom: -1,
                fontSize: "var(--text-md)",
                fontWeight: 600,
                color: active ? "var(--espresso)" : "var(--mocha)",
                borderBottom: "2px solid " + (active ? "var(--caramel)" : "transparent"),
              }}
            >
              {lbl}
              {count != null && (
                <span style={{ marginLeft: 7, fontSize: "var(--text-xs)", color: "var(--mocha)" }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {section === "shelf" ? (
        shelf.length === 0 ? (
          <JournalEmpty
            icon="bookmark"
            title="Your shelf is empty"
            hint="Add the bags you're brewing with to track what's left and rate every pour."
            cta={{ label: "Add your first bag", icon: "plus", onClick: onAddBag }}
          />
        ) : (
          <div
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}
          >
            <button
              onClick={onAddBag}
              aria-label="Add a bag to your shelf"
              style={{
                minHeight: 132,
                borderRadius: "var(--r-lg)",
                border: "2px dashed var(--line)",
                background: "transparent",
                color: "var(--mocha)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                fontSize: "var(--text-sm)",
                fontWeight: 600,
              }}
            >
              <Icon name="plus" size={26} color="var(--mocha)" /> Add a bag
            </button>
            {shelf.map((b, i) => (
              <ShelfCard key={b.id} bag={b} onBrew={onBrew} onOpen={onOpenBean} delay={i * 40} />
            ))}
          </div>
        )
      ) : section === "saved" ? (
        savedTastings.length === 0 && wishlistedBeans.length === 0 ? (
          <JournalEmpty
            icon="bookmark"
            title="Nothing saved yet"
            hint="Save a brew you love, or mark a bean you want to try."
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {savedTastings.length > 0 && (
              <div>
                <h2 className="display" style={{ fontSize: "var(--text-2xl)", fontWeight: 600, marginBottom: 14 }}>
                  Saved brews
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {savedTastings.map((t, i) => (
                    <TastingCard
                      key={t.id}
                      tasting={t}
                      delay={i * 50}
                      onOpenBean={onOpenBean}
                      onLike={onLike}
                      liked={likes.has(t.id)}
                    />
                  ))}
                </div>
              </div>
            )}
            {wishlistedBeans.length > 0 && (
              <div>
                <h2 className="display" style={{ fontSize: "var(--text-2xl)", fontWeight: 600, marginBottom: 14 }}>
                  Want to try
                </h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
                  {wishlistedBeans.map((b, i) => (
                    <BeanCard key={b.id} bean={b} onOpen={onOpenBean} delay={i * 40} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      ) : mine.length === 0 ? (
        <JournalEmpty
          icon="drop"
          title="No brews logged yet"
          hint="Pull a shot, pour a cup, and log how it tasted. Your tasting history builds from here."
          cta={{ label: "Log your first brew", icon: "drop", onClick: () => onBrew() }}
        />
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: 16 }}>
            <div
              role="group"
              aria-label="View as"
              style={{
                display: "flex",
                gap: 4,
                padding: 4,
                background: "var(--surface-2)",
                borderRadius: 10,
                border: "1px solid var(--line-soft)",
              }}
            >
              {(
                [
                  ["timeline", "journal"],
                  ["grid", "grid"],
                ] as const
              ).map(([v, ic]) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  aria-label={v === "timeline" ? "Timeline view" : "Grid view"}
                  aria-pressed={view === v}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 7,
                    display: "flex",
                    alignItems: "center",
                    background: view === v ? "var(--surface)" : "transparent",
                    boxShadow: view === v ? "var(--shadow-sm)" : "none",
                    color: view === v ? "var(--espresso)" : "var(--mocha)",
                  }}
                >
                  <Icon name={ic} size={17} />
                </button>
              ))}
            </div>
          </div>
          {view === "timeline" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {mine.map((t, i) => (
                <TastingCard
                  key={t.id}
                  tasting={t}
                  delay={i * 50}
                  onOpenBean={onOpenBean}
                  onLike={onLike}
                  liked={likes.has(t.id)}
                />
              ))}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
              {mine.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => onOpenBean(t.beanId)}
                  className="fade-up"
                  style={{
                    animationDelay: staggerMs(i * 40),
                    textAlign: "left",
                    padding: 14,
                    borderRadius: "var(--r-md)",
                    background: "var(--surface)",
                    border: "1px solid var(--line-soft)",
                    boxShadow: "var(--shadow-sm)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <BeanBag color={t.beanColor} size={44} />
                  <div className="display" style={{ fontWeight: 600, fontSize: "var(--text-md)", lineHeight: 1.15 }}>
                    {t.beanName}
                  </div>
                  <BeanRating value={t.rating} size={13} />
                  <div style={{ fontSize: "var(--text-2xs)", color: "var(--mocha)" }}>
                    {t.brew}<RelTime iso={t.createdAt} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Friendly empty state for the Journal sections (no brews / empty shelf / nothing saved).
function JournalEmpty({
  title,
  hint,
  icon,
  cta,
}: {
  title: string;
  hint: string;
  icon: IconName;
  cta?: { label: string; icon: IconName; onClick: () => void };
}) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--mocha)" }}>
      <div style={{ display: "inline-flex", marginBottom: 14, opacity: 0.5 }}>
        <Icon name={icon} size={40} />
      </div>
      <p style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--coffee)" }}>{title}</p>
      <p style={{ fontSize: "var(--text-base)", marginTop: 6, maxWidth: 360, marginInline: "auto" }}>{hint}</p>
      {cta && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
          <Button onClick={cta.onClick}>
            <Icon name={cta.icon} size={17} color="currentColor" /> {cta.label}
          </Button>
        </div>
      )}
    </div>
  );
}

// Shelf card — a bag you own, with remaining indicator + quick brew
function ShelfCard({
  bag,
  onBrew,
  onOpen,
  delay,
}: {
  bag: Bean;
  onBrew: (beanId?: string) => void;
  onOpen: (id: string) => void;
  delay: number;
}) {
  const D = useData();
  const roaster = D.roaster(bag.roasterId);
  return (
    <div
      className="fade-up"
      style={{
        animationDelay: staggerMs(delay),
        background: "var(--surface)",
        border: "1px solid var(--line-soft)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <button
        onClick={() => onOpen(bag.id)}
        style={{
          textAlign: "left",
          padding: "15px 15px 12px",
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          background: `linear-gradient(180deg, color-mix(in oklch, ${bag.color} 12%, var(--surface)), var(--surface))`,
        }}
      >
        <BeanBag color={bag.color} size={42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="display" style={{ fontWeight: 600, fontSize: "var(--text-md)", lineHeight: 1.1 }}>
            {bag.name}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--mocha)", marginTop: 2 }}>
            {roaster ? roaster.name : bag.roasterName}
          </div>
          {bag.scaScore ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 7 }}>
              <span className="mono" style={{ fontSize: "var(--text-2xs)", color: "var(--mocha)", letterSpacing: "0.05em" }}>
                SCA
              </span>
              <span style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--caramel-deep)" }}>{bag.scaScore}</span>
            </div>
          ) : null}
        </div>
      </button>
      <div style={{ padding: "0 15px 14px", marginTop: "auto" }}>
        {bag.remaining != null && (
          <div style={{ marginBottom: 12 }}>
            <div
              style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-2xs)", color: "var(--mocha)", marginBottom: 4 }}
              className="mono"
            >
              <span>{bag.remaining === 0 ? "EMPTY" : Math.round(bag.remaining * 100) + "% LEFT"}</span>
              <span>{bag.bagWeight}</span>
            </div>
            <div style={{ height: 5, borderRadius: 99, background: "var(--line)", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: bag.remaining * 100 + "%",
                  background: bag.remaining < 0.2 ? "var(--caramel-deep)" : "var(--caramel)",
                  borderRadius: 99,
                }}
              />
            </div>
          </div>
        )}
        <Button variant="outline" onClick={() => onBrew(bag.id)} className="w-full">
          <Icon name="drop" size={16} color="var(--caramel)" /> Log a brew
        </Button>
      </div>
    </div>
  );
}

function Stat({ big, label, icon }: { big: React.ReactNode; label: string; icon?: boolean }) {
  return (
    <div
      style={{
        padding: "16px 16px",
        borderRadius: "var(--r-md)",
        background: "var(--surface)",
        border: "1px solid var(--line-soft)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        className="display"
        style={{ fontSize: "var(--text-3xl)", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}
      >
        {icon && <BeanGlyph size={20} filled />}
        {big}
      </div>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--mocha)", marginTop: 3 }}>{label}</div>
    </div>
  );
}

// ---------- DISCOVER ----------
export function DiscoverScreen({
  initialBeans,
  trending,
  onOpenBean,
  onOpenRoaster,
  query,
  setQuery,
}: {
  initialBeans: Page<Bean>;
  trending: Bean[];
  onOpenBean: (id: string) => void;
  onOpenRoaster: (id: string) => void;
  query: string;
  setQuery: (q: string) => void;
}) {
  const D = useData();
  const [tab, setTab] = useState<"Beans" | "Roasters">("Beans");
  const [process, setProcess] = useState("All");
  const processes = ["All", "Washed", "Natural", "Honey"];

  const { rows: beans, loadMore, hasMore, pending, reset } = useLoadMore(initialBeans, (c) =>
    loadMoreBeans(c, process === "All" ? null : process, query || null),
  );
  // Server-side process/text filter: re-fetch page 1 when either changes
  // (debounced for typing so a search doesn't fire per keystroke).
  useEffect(() => {
    let active = true;
    const run = () => {
      if (process === "All" && !query) {
        if (active) reset(initialBeans);
        return;
      }
      loadMoreBeans(null, process === "All" ? null : process, query || null)
        .then((p) => { if (active) reset(p); })
        .catch(() => { if (active) reset({ rows: [], nextCursor: null }); });
    };
    const t = setTimeout(run, query ? 250 : 0);
    return () => { active = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [process, query, initialBeans]);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      <ScreenHead
        kicker="Find your next bag"
        title="Discover"
        sub="Browse single-origins and the roasters behind them."
      />

      {/* search */}
      <div className="relative" style={{ marginBottom: 18 }}>
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
          <Icon name="search" size={19} color="var(--mocha)" />
        </span>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search beans, origins, flavor notes…"
          className="h-auto rounded-[var(--r-md)] border-[var(--line)] bg-[var(--surface)] py-3 pl-12 pr-11 text-[length:var(--text-md)] text-[var(--espresso)] shadow-[var(--shadow-sm)]"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-4 top-1/2 -translate-y-1/2"
            aria-label="Clear search"
          >
            <Icon name="close" size={18} color="var(--mocha)" />
          </button>
        )}
      </div>

      <div role="group" aria-label="Discover view" style={{ display: "flex", gap: 8, marginBottom: 22 }}>
        {(["Beans", "Roasters"] as const).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-pressed={active}
              style={{
                padding: "8px 18px",
                borderRadius: 99,
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                background: active ? "var(--espresso)" : "var(--surface)",
                color: active ? "var(--cream)" : "var(--coffee)",
                border: "1px solid " + (active ? "var(--espresso)" : "var(--line)"),
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      {tab === "Beans" ? (
        <>
          {!query && (
            <div style={{ marginBottom: 30 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <Icon name="trend" size={18} color="var(--caramel)" />
                <h2 className="display" style={{ fontSize: "var(--text-2xl)", fontWeight: 600, whiteSpace: "nowrap" }}>
                  Trending this week
                </h2>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                {trending.map((b, i) => (
                  <TrendingCard key={b.id} bean={b} rank={i + 1} delay={i * 40} onOpen={onOpenBean} />
                ))}
              </div>
            </div>
          )}
          <div role="group" aria-label="Filter by process" style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {processes.map((p) => (
              <button
                key={p}
                onClick={() => setProcess(p)}
                aria-pressed={process === p}
                style={{
                  padding: "6px 13px",
                  borderRadius: 99,
                  fontSize: "var(--text-xs)",
                  fontWeight: 600,
                  background: process === p ? "var(--caramel-soft)" : "transparent",
                  color: process === p ? "var(--caramel-deep)" : "var(--mocha)",
                  border: "1px solid " + (process === p ? "transparent" : "var(--line)"),
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <div role="list" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
            {beans.map((b, i) => (
              <div role="listitem" key={b.id}>
                <BeanCard bean={b} onOpen={onOpenBean} delay={i * 40} />
              </div>
            ))}
          </div>
          {hasMore && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 22 }}>
              <Button variant="outline" onClick={loadMore} disabled={pending}>
                {pending ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
          {beans.length === 0 && <Empty query={query} />}
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {D.ROASTERS.map((r, i) => (
            <RoasterCard key={r.id} roaster={r} onOpen={onOpenRoaster} delay={i * 40} />
          ))}
        </div>
      )}
    </div>
  );
}

function TrendingCard({
  bean,
  rank,
  delay = 0,
  onOpen,
}: {
  bean: Bean;
  rank: number;
  delay?: number;
  onOpen: (id: string) => void;
}) {
  const D = useData();
  return (
    <button
      onClick={() => onOpen(bean.id)}
      className="fade-up"
      style={{
        animationDelay: staggerMs(delay),
        display: "flex",
        alignItems: "center",
        gap: 13,
        padding: 14,
        textAlign: "left",
        background: "var(--surface)",
        border: "1px solid var(--line-soft)",
        borderRadius: "var(--r-md)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div
        className="display"
        style={{ fontSize: "var(--text-3xl)", fontWeight: 700, color: "var(--caramel)", width: 26, textAlign: "center" }}
      >
        {rank}
      </div>
      <BeanBag color={bean.color} size={42} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="display" style={{ fontWeight: 600, fontSize: "var(--text-md)", lineHeight: 1.1 }}>
          {bean.name}
        </div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--mocha)", marginTop: 2 }}>
          {D.roaster(bean.roasterId)?.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6 }}>
          <BeanGlyph size={13} filled />
          <span style={{ fontWeight: 700, fontSize: "var(--text-xs)" }}>{bean.avgRating}</span>
        </div>
      </div>
    </button>
  );
}

function RoasterCard({ roaster, onOpen, delay }: { roaster: Roaster; onOpen: (id: string) => void; delay: number }) {
  return (
    <button
      onClick={() => onOpen(roaster.id)}
      className="fade-up"
      style={{
        textAlign: "left",
        background: "var(--surface)",
        border: "1px solid var(--line-soft)",
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
        boxShadow: "var(--shadow-sm)",
        animationDelay: staggerMs(delay),
      }}
    >
      <Placeholder label="roaster photo" h={96} color="var(--caramel)" />
      <div style={{ padding: "14px 16px 16px" }}>
        <div className="display" style={{ fontSize: "var(--text-xl)", fontWeight: 600 }}>
          {roaster.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--text-xs)", color: "var(--mocha)", marginTop: 3 }}>
          <Icon name="pin" size={13} color="var(--mocha)" />
          {roaster.city} · est. {roaster.founded}
        </div>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--coffee)", marginTop: 10, lineHeight: 1.5, textWrap: "pretty" }}>
          {roaster.blurb}
        </p>
        <div style={{ display: "flex", gap: 16, marginTop: 13, fontSize: "var(--text-xs)", color: "var(--mocha)" }}>
          <span>
            <b style={{ color: "var(--espresso)" }}>{roaster.beans}</b> {roaster.beans === 1 ? "bean" : "beans"}
          </span>
          <span>
            <b style={{ color: "var(--espresso)" }}>{roaster.followers.toLocaleString()}</b>{" "}
            {roaster.followers === 1 ? "follower" : "followers"}
          </span>
        </div>
      </div>
    </button>
  );
}

function Empty({ query }: { query: string }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--mocha)" }}>
      <div style={{ display: "inline-flex", marginBottom: 14, opacity: 0.5 }}>
        <Icon name="search" size={40} />
      </div>
      <p style={{ fontSize: "var(--text-md)" }}>No beans match “{query}”. Try another origin or flavor.</p>
    </div>
  );
}
