import { Skeleton } from "@/components/skeleton";

// Fires on navigation into /journal. Mirrors JournalScreen's anatomy
// (screens.tsx) so the real content streaming in does not cause a layout shift:
// maxWidth 760 wrapper, ScreenHead (kicker + title + sub + Add bag / Log a brew
// actions), the 4-up stats grid (auto-fit minmax(120px)), the section toggle
// (Brews / My Shelf / Saved) with its bottom border, then the brews timeline.
// minHeight 300vh so a back/forward scrollTop restore is not clamped against a
// short fallback while the real content streams in.
export default function JournalLoading() {
  return (
    <div role="status" aria-label="Loading journal" style={{ minHeight: "300vh", maxWidth: 760, margin: "0 auto" }}>
      {/* ScreenHead: kicker + title + sub + actions */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
        <div>
          <Skeleton w={92} h={11} style={{ marginBottom: 8 }} />
          <Skeleton w={210} h={30} style={{ marginBottom: 8 }} />
          <Skeleton w={300} h={14} style={{ maxWidth: "100%" }} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Skeleton w={104} h={40} r="var(--r-md)" />
          <Skeleton w={116} h={40} r="var(--r-md)" />
        </div>
      </div>

      {/* stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: 26 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} h={86} r="var(--r-md)" />
        ))}
      </div>

      {/* section toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid var(--line-soft)" }}>
        <Skeleton w={54} h={18} />
        <Skeleton w={70} h={18} />
        <Skeleton w={56} h={18} />
      </div>

      {/* brews timeline */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} w="100%" h={120} r={16} />
        ))}
      </div>
    </div>
  );
}
