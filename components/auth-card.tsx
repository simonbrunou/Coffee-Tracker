import Link from "next/link";
import { BrandMark } from "./brand-mark";
import { Button } from "@/components/ui/button";

/** Centered, branded auth card shared by /login and /signup so both pages match
 *  the rest of the app instead of being bare forms. Server-safe. */
export function AuthCard({
  title,
  sub,
  children,
  footer,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div style={{ width: "100%", maxWidth: 400 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14, marginBottom: 24 }}>
        <BrandMark size={46} />
        <div>
          <h1 className="display" style={{ fontSize: "var(--text-3xl)", fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</h1>
          <p style={{ fontSize: "var(--text-md)", color: "var(--mocha)", marginTop: 4 }}>{sub}</p>
        </div>
      </div>
      <div style={{ background: "var(--surface)", border: "1px solid var(--line-soft)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)", padding: "24px 22px" }}>
        {children}
      </div>
      <p style={{ marginTop: 18, textAlign: "center", fontSize: "var(--text-base)", color: "var(--mocha)" }}>{footer}</p>
    </div>
  );
}

/** "or" rule between the OAuth and credentials blocks. */
export function AuthDivider({ label = "or" }: { label?: string }) {
  const rule = { flex: 1, height: 1, background: "var(--line-soft)" } as const;
  return (
    <div className="mono" style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0", color: "var(--mocha)", fontSize: "var(--text-2xs)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
      <span style={rule} />
      {label}
      <span style={rule} />
    </div>
  );
}

/** The GitHub + Google sign-in buttons, used on BOTH auth pages (OAuth sign-in is
 *  also sign-up). The page supplies the provider-specific server actions. */
export function OAuthButtons({ githubAction, googleAction }: { githubAction: () => void; googleAction: () => void }) {
  const btn = { width: "100%", gap: 10 } as const;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <form action={githubAction}>
        <Button type="submit" variant="outline" style={btn}><GitHubMark /> Continue with GitHub</Button>
      </form>
      <form action={googleAction}>
        <Button type="submit" variant="outline" style={btn}><GoogleMark /> Continue with Google</Button>
      </form>
    </div>
  );
}

export function AuthFooterLink({ prompt, href, label }: { prompt: string; href: string; label: string }) {
  return (
    <>
      {prompt}{" "}
      <Link href={href} style={{ color: "var(--espresso)", fontWeight: 600 }}>{label}</Link>
    </>
  );
}

function GitHubMark() {
  return (
    <svg width={17} height={17} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg width={16} height={16} viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 009 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 010-3.44V4.95H.96a9 9 0 000 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 00.96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
