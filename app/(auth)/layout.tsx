// The (auth) group holds the standalone auth pages (/login, /signup). Unlike the
// (app) group's layout, this one runs NO per-user data load and mounts NO app
// shell — the auth pages are self-contained centered forms that never read the
// shared client state, so they skip the per-request roasters+feed+per-user DB
// queries and render without the nav chrome. The root layout still provides
// html/body/fonts/theme + the per-request nonce CSP (force-dynamic cascades here).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // Vertically center the auth card on both viewports. min-height:100dvh + flex
  // centering replaces the old top-pinned `margin:60px auto` (which left a vast
  // empty page below). The top/bottom padding keeps the card from clipping on
  // short screens where the form is taller than the viewport.
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 20px",
      }}
    >
      {children}
    </div>
  );
}
