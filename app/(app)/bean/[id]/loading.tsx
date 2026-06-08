import { Skeleton } from "@/components/skeleton";

// Fires because bean/[id]/page.tsx awaits the DB (getBeanCached + reviews page).
// minHeight 300vh guards back/forward scroll restore (see discover/loading.tsx).
export default function BeanLoading() {
  return (
    <div role="status" aria-label="Loading bean" style={{ minHeight: "300vh" }}>
      <Skeleton w={120} h={16} style={{ marginBottom: 18 }} />
      <div style={{ display: "flex", gap: 20, marginBottom: 28, flexWrap: "wrap" }}>
        <Skeleton w={160} h={200} r={18} />
        <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 12 }}>
          <Skeleton w="70%" h={34} />
          <Skeleton w="40%" h={18} />
          <Skeleton w="55%" h={18} />
          <Skeleton w="100%" h={70} r={12} style={{ marginTop: 8 }} />
        </div>
      </div>
      <Skeleton w={160} h={22} style={{ marginBottom: 14 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} w="100%" h={96} r={14} />
        ))}
      </div>
    </div>
  );
}
