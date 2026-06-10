import { Skeleton } from "@/components/skeleton";

// Fires because discover/page.tsx awaits the DB (getDiscoverBeansPage + trending).
// minHeight 300vh so a back/forward scrollTop restore is not clamped against a
// short fallback — app-provider restores scroll on the pathname flip, before the
// real content has streamed in.
//
// This MUST mirror DiscoverScreen's anatomy (screens.tsx) to avoid a layout
// shift when the real content streams in: maxWidth 980 wrapper, ScreenHead
// (kicker + title + sub), search bar, Beans/Roasters tabs, the "Trending this
// week" rail (heading + auto-fit minmax(220px) grid), the process filter chips,
// then the main bean grid (auto-fill minmax(290px)).
export default function DiscoverLoading() {
  return (
    <div role="status" aria-label="Loading discover" style={{ minHeight: "300vh", maxWidth: 980, margin: "0 auto" }}>
      {/* ScreenHead: kicker + title + sub */}
      <div style={{ marginBottom: 22 }}>
        <Skeleton w={120} h={11} style={{ marginBottom: 8 }} />
        <Skeleton w={200} h={30} style={{ marginBottom: 8 }} />
        <Skeleton w={320} h={14} style={{ maxWidth: "100%" }} />
      </div>

      {/* search */}
      <Skeleton w="100%" h={48} r="var(--r-md)" style={{ marginBottom: 18 }} />

      {/* Beans / Roasters tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
        <Skeleton w={78} h={34} r={99} />
        <Skeleton w={92} h={34} r={99} />
      </div>

      {/* Trending this week */}
      <div style={{ marginBottom: 30 }}>
        <Skeleton w={180} h={19} style={{ marginBottom: 14 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} h={108} r={16} />
          ))}
        </div>
      </div>

      {/* process filter chips */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[52, 74, 70, 64].map((w, i) => (
          <Skeleton key={i} w={w} h={30} r={99} />
        ))}
      </div>

      {/* main bean grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} h={150} r={16} />
        ))}
      </div>
    </div>
  );
}
