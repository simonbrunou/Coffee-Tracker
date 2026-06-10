import { Skeleton } from "@/components/skeleton";

// Cold-open boundary: shown while app/(app)/layout.tsx is still awaiting
// getAppData(), i.e. BEFORE AppProvider mounts. MUST stay context-free — any
// provider/data hook would throw here (no provider yet). This is the
// highest-value skeleton: it's what users see during the slow getAppData
// cold-open. It mirrors the app shell (sidebar + mobile-top + bottom-nav
// silhouettes) so the first paint is chrome, not a bare spinner. The cold-open
// always starts at the top, so no scroll-restore min-height is needed here.
export default function AppShellLoading() {
  return (
    <div role="status" aria-label="Loading" style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Desktop sidebar silhouette (.sidebar hides < 880px) */}
      <div className="sidebar">
        <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "4px 8px 26px" }}>
          <Skeleton w={38} h={38} r="50%" />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Skeleton w={84} h={16} />
            <Skeleton w={64} h={9} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} w="100%" h={42} r={12} />
          ))}
        </div>
        <Skeleton w="100%" h={40} r={12} style={{ marginTop: 20 }} />
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 8, paddingTop: 20 }}>
          <Skeleton w={36} h={36} r="50%" />
          <Skeleton w={120} h={14} />
        </div>
      </div>

      {/* Main scroll area */}
      <div className="main-scroll">
        {/* Mobile-top silhouette (.mobile-top shows < 880px) */}
        <div className="mobile-top">
          <Skeleton w={120} h={24} />
          <Skeleton w={64} h={28} r={10} />
        </div>
        <div className="screen-pad">
          <Skeleton w={220} h={30} style={{ marginBottom: 20 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} w="100%" h={120} r={16} />
            ))}
          </div>
        </div>
      </div>

      {/* Mobile bottom-nav silhouette (.bottom-nav shows < 880px) */}
      <div className="bottom-nav">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} w={30} h={30} r={8} />
        ))}
      </div>
    </div>
  );
}
