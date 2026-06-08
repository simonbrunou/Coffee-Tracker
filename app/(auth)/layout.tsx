// The (auth) group holds the standalone auth pages (/login, /signup). Unlike the
// (app) group's layout, this one runs NO per-user data load and mounts NO app
// shell — the auth pages are self-contained centered forms that never read the
// shared client state, so they skip the per-request roasters+feed+per-user DB
// queries and render without the nav chrome. The root layout still provides
// html/body/fonts/theme + the per-request nonce CSP (force-dynamic cascades here).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
