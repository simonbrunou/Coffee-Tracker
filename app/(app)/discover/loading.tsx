import { Skeleton } from "@/components/skeleton";

// Fires because discover/page.tsx awaits the DB (getDiscoverBeansPage + trending).
// minHeight 300vh so a back/forward scrollTop restore is not clamped against a
// short fallback — app-provider restores scroll on the pathname flip, before the
// real content has streamed in.
export default function DiscoverLoading() {
  return (
    <div role="status" aria-label="Loading discover" style={{ minHeight: "300vh" }}>
      <Skeleton w={200} h={30} style={{ marginBottom: 16 }} />
      <Skeleton w="100%" h={48} r={14} style={{ marginBottom: 24, maxWidth: 520 }} />
      <Skeleton w={140} h={18} style={{ marginBottom: 14 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} h={150} r={16} />
        ))}
      </div>
    </div>
  );
}
