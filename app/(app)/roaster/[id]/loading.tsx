import { Skeleton } from "@/components/skeleton";

// Fires because roaster/[id]/page.tsx awaits the DB (getRoasterByIdCached + beans).
// minHeight 300vh guards back/forward scroll restore (see discover/loading.tsx).
export default function RoasterLoading() {
  return (
    <div role="status" aria-label="Loading roaster" style={{ minHeight: "300vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
        <Skeleton w={72} h={72} r="50%" />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Skeleton w={200} h={30} />
          <Skeleton w={140} h={16} />
        </div>
      </div>
      <Skeleton w="100%" h={60} r={12} style={{ marginBottom: 24, maxWidth: 620 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} h={150} r={16} />
        ))}
      </div>
    </div>
  );
}
