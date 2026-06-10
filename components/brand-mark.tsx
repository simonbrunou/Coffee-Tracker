/** The Cortado brand mark: an espresso disc with the caramel coffee-bean glyph.
 *  Server-safe (pure SVG) so it can render in the auth pages without pulling in a
 *  client boundary. Shared by the app shell (sidebar + mobile header) and the
 *  auth card. */
export function BrandMark({ size = 38 }: { size?: number }) {
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
