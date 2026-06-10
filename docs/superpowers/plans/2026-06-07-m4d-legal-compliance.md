# M4·D — Legal / Compliance Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/privacy`, `/terms`, `/cookies` as always-available, DB-independent pages, restructuring the route tree so `getAppData()` only wraps the actual app.

**Architecture:** Architecture B — a minimal, DB-independent root `app/layout.tsx`; `getAppData()` + `AppProvider` move into a new `app/(app)/layout.tsx`; legal pages live in a new `app/(legal)/` group with its own minimal chrome. Spec: `docs/superpowers/specs/2026-06-07-m4d-legal-compliance-design.md`.

**Tech Stack:** Next.js 15.5 App Router, React 19, TypeScript, Tailwind v4 + `globals.css`, Vitest (`readFileSync` structural tests), next-themes.

**Cuts (green at each commit):** (1) restructure → (2) `(legal)` group + pages → (3) discoverability surfaces → (4) live verification.

---

## Cut 1 — Route-group restructure

### Task 1: Structural guard test for the restructure

**Files:**
- Test: `test/route-structure.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const p = (...s: string[]) => join(root, ...s);
const read = (...s: string[]) => readFileSync(p(...s), "utf8");

describe("route-group restructure (Architecture B)", () => {
  it("root layout is DB-independent but stays force-dynamic", () => {
    const layout = read("app/layout.tsx");
    // change-driving asserts = the two not.toMatch below; the rest are CSP/theme regression guards
    expect(layout).not.toMatch(/getAppData/);
    expect(layout).not.toMatch(/AppProvider/);
    expect(layout).toMatch(/export const dynamic = "force-dynamic"/);
    expect(layout).toMatch(/ThemeProvider/);
    expect(layout).toMatch(/x-nonce/);
  });

  it("(app) layout owns getAppData + AppProvider", () => {
    const layout = read("app/(app)/layout.tsx");
    expect(layout).toMatch(/getAppData/);
    expect(layout).toMatch(/AppProvider/);
  });

  it("every route whose tree uses useShell/useData lives under (app)", () => {
    for (const f of [
      "app/(app)/page.tsx",
      "app/(app)/discover/page.tsx",
      "app/(app)/journal/page.tsx",
      "app/(app)/profile/page.tsx",
      "app/(app)/settings/page.tsx",
      "app/(app)/login/page.tsx",
      "app/(app)/signup/page.tsx",
      "app/(app)/bean/[id]/page.tsx",
      "app/(app)/roaster/[id]/page.tsx",
      "app/(app)/loading.tsx",
    ]) {
      expect(existsSync(p(f)), `${f} exists`).toBe(true);
    }
    // old locations are gone
    for (const f of ["app/page.tsx", "app/bean", "app/roaster", "app/loading.tsx"]) {
      expect(existsSync(p(f)), `${f} moved`).toBe(false);
    }
  });

  it("DB-independent special files stay at app/ root", () => {
    for (const f of ["app/error.tsx", "app/not-found.tsx", "app/global-error.tsx", "app/globals.css", "app/icon.svg"]) {
      expect(existsSync(p(f)), `${f} at root`).toBe(true);
    }
  });

  it("api routes are NOT inside a route group", () => {
    for (const f of [
      "app/api/health/route.ts",
      "app/api/csp-report/route.ts",
      "app/api/verify/route.ts",
      "app/api/auth/[...nextauth]/route.ts",
    ]) {
      expect(existsSync(p(f)), `${f} unchanged`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/route-structure.test.ts`
Expected: FAIL (`app/(app)/layout.tsx` and the moved files do not exist yet).

### Task 2: Perform the restructure

**Files:**
- Create: `app/(app)/layout.tsx`
- Modify (rewrite): `app/layout.tsx`
- Move (git mv): `app/page.tsx`, `app/discover/`, `app/journal/`, `app/profile/`, `app/settings/`, `app/login/`, `app/signup/`, `app/bean/`, `app/roaster/`, `app/loading.tsx` → under `app/(app)/`

- [ ] **Step 1: Move all `(app)`-group routes (preserve history)**

```bash
cd /home/sbrn/Projects/Coffee-Tracker
mkdir -p "app/(app)"
git mv app/page.tsx "app/(app)/page.tsx"
git mv app/loading.tsx "app/(app)/loading.tsx"
git mv app/discover "app/(app)/discover"
git mv app/journal "app/(app)/journal"
git mv app/profile "app/(app)/profile"
git mv app/settings "app/(app)/settings"
git mv app/login "app/(app)/login"
git mv app/signup "app/(app)/signup"
git mv app/bean "app/(app)/bean"
git mv app/roaster "app/(app)/roaster"
```

Note: `app/actions.ts`, `app/account-actions.ts`, `app/auth-actions.ts`, `app/verify-actions.ts` and `app/api/` are **not** moved.

- [ ] **Step 2: Create `app/(app)/layout.tsx` (owns the DB read + shell)**

```tsx
import { AppProvider } from "@/components/app-provider";
import { getAppData } from "@/lib/queries";

// Read fresh from Postgres on each full load; the AppProvider's client state
// then persists across client-side route navigation. This nested layout is the
// ONLY place getAppData() runs — the root layout stays DB-independent so the
// (legal) group survives a DB outage.
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const initialData = await getAppData();
  return <AppProvider initialData={initialData}>{children}</AppProvider>;
}
```

- [ ] **Step 3: Rewrite `app/layout.tsx` minimal (DB-independent)**

```tsx
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Spectral, Hanken_Grotesk } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// force-dynamic stays at the ROOT so every route (including the (legal) group)
// is dynamically rendered — required by the per-request nonce CSP (see
// middleware.ts). The root no longer reads Postgres: getAppData() moved to
// app/(app)/layout.tsx, so legal pages render even when the DB is down.
export const dynamic = "force-dynamic";

const spectral = Spectral({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-spectral",
  display: "swap",
  fallback: ["Georgia", "serif"],
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
  fallback: ["-apple-system", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Cortado — Coffee Journal",
  description:
    "A warm, cozy coffee journal. Log your bags and brews, taste with the SCA flavor wheel, and discover single-origins and the roasters behind them.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // theme-color is set client-side in AppProvider to follow the in-app theme toggle
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Per-request nonce set by middleware — forwarded to next-themes so its
  // pre-paint inline script is allowed under the strict-dynamic CSP.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning className={`${spectral.variable} ${hanken.variable}`}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange nonce={nonce}>
          {children}
          <Toaster position="bottom-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Refresh the now-stale `app/global-error.tsx` comment**

`getAppData()` no longer runs in the root layout, so the header comment in `app/global-error.tsx` ("Catches a crash in the ROOT layout itself (e.g. getAppData() throwing…)") is now misleading. Update it to: it catches a crash in the *minimal root layout itself*; a `getAppData()` failure now lives in `app/(app)/layout.tsx` and bubbles to the root `error.tsx`. Comment-only — no behavior change.

- [ ] **Step 5: Run the structural test + typecheck**

Run: `npx vitest run test/route-structure.test.ts && npx tsc --noEmit; echo "exit $?"`
Expected: structural test PASS; tsc exit 0.

- [ ] **Step 6: Full suite + build (the real regression gate)**

Run: `npm run test; echo "vitest $?"` (ensure `coffee-pg` is up — the `integration` vitest project needs Postgres) then `npm run build; echo "build $?"`
Expected: all green (build proves the moved routes still compile and prerender-analyze cleanly).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(m4d): (app) route group — DB-independent root, getAppData in nested layout"
```

---

## Cut 2 — `(legal)` group + pages

### Task 3: `(legal)` layout + scoped typography

**Files:**
- Create: `app/(legal)/layout.tsx`
- Create: `app/(legal)/legal.module.css`
- Test: `test/legal-pages.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const p = (...s: string[]) => join(process.cwd(), ...s);
const read = (...s: string[]) => readFileSync(p(...s), "utf8");
const PAGES = ["privacy", "terms", "cookies"] as const;

describe("(legal) group", () => {
  it("layout exists, is DB-independent, shows the disclaimer + footer links", () => {
    const layout = read("app/(legal)/layout.tsx");
    expect(layout).not.toMatch(/getAppData|@\/lib\/db|@\/lib\/queries|AppProvider/);
    expect(layout).toMatch(/review (it )?with (qualified )?counsel/i);
    expect(layout).toMatch(/title:/); // legal metadata title is set (merges over root)
    for (const slug of PAGES) expect(layout).toContain(`/${slug}`);
  });

  for (const slug of PAGES) {
    it(`${slug} page exists, imports no DB, has a heading + last-updated`, () => {
      const f = `app/(legal)/${slug}/page.tsx`;
      expect(existsSync(p(f)), `${f} exists`).toBe(true);
      const src = read(f);
      expect(src).not.toMatch(/getAppData|@\/lib\/db|@\/lib\/queries/);
      expect(src).toMatch(/<h1/);
      expect(src).toMatch(/Last updated/i);
    });
  }

  it("privacy discloses real processors + honest caveats, not fictional ones", () => {
    const f = "app/(legal)/privacy/page.tsx";
    expect(existsSync(p(f)), `${f} exists`).toBe(true);
    const src = read(f);
    expect(src).toMatch(/Resend/);
    expect(src).toMatch(/Google/);
    expect(src).toMatch(/GitHub/);
    expect(src).toMatch(/bcrypt/i);
    // honest deletion caveat (Risk #5) — assert the SEMANTICS, not just the word "log"
    expect(src).toMatch(/best[- ]effort|persist until|not .*purged by deletion|eligible for deletion/i);
    expect(src).toMatch(/other (people|users)/i); // deleting also removes others' interactions
    expect(src).not.toMatch(/total erasure|erase[sd]? all your data/i); // no over-promise
    // no fictional third parties
    expect(src).not.toMatch(/Google Analytics|Google Fonts|Gravatar|Sentry/);
  });

  it("cookie notice lists the real cookies + the localStorage theme key, no banner", () => {
    const f = "app/(legal)/cookies/page.tsx";
    expect(existsSync(p(f)), `${f} exists`).toBe(true);
    const src = read(f);
    expect(src).toMatch(/authjs\.session-token/);
    expect(src).toMatch(/authjs\.csrf-token/);
    expect(src).toMatch(/localStorage/);
    expect(src).toMatch(/no .*(analytics|tracking|advertising)/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/legal-pages.test.ts`
Expected: FAIL (no `(legal)` files yet).

- [ ] **Step 3: Create `app/(legal)/legal.module.css`**

CSS module gives the legal pages real vertical rhythm without touching `globals.css` (whose universal `* { margin:0; padding:0 }` reset strips defaults). No `height:100%`/`overflow:hidden` wrapper — natural document flow so long pages scroll. **Colors use only the real `globals.css` tokens** (`--cream`, `--cream-deep`, `--espresso`, `--caramel-deep`, `--border`), all of which flip under `.dark`, so legal pages follow the persisted theme — do **not** invent `--bg`/`--ink` (they don't exist).

```css
.shell {
  /* 100dvh (not 100%) so it is independent of globals.css `html,body{height:100%}`,
     guaranteeing natural document scroll for long pages. Colors use REAL globals.css
     tokens that flip under .dark — do NOT invent --bg/--ink (they don't exist). */
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--cream, #faf6f0);
  color: var(--espresso, #2b2420);
}
.header {
  display: flex;
  align-items: center;
  padding: 18px 24px;
  border-bottom: 1px solid var(--border, rgba(0, 0, 0, 0.08));
}
.wordmark {
  font-family: var(--font-spectral), Georgia, serif;
  font-size: 20px;
  font-weight: 700;
  color: inherit;
  text-decoration: none;
}
.main {
  flex: 1;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: 40px 24px 72px;
}
.disclaimer {
  border: 1px solid var(--border, rgba(0, 0, 0, 0.12));
  background: var(--cream-deep, #f5ecd9);
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 28px;
  font-size: 14px;
}
.prose h1 { font-family: var(--font-spectral), Georgia, serif; font-size: 30px; font-weight: 700; margin-bottom: 6px; }
.prose h2 { font-family: var(--font-spectral), Georgia, serif; font-size: 20px; font-weight: 600; margin: 28px 0 10px; }
.prose p, .prose li { font-size: 15px; line-height: 1.7; }
.prose p { margin-bottom: 12px; }
.prose ul { margin: 0 0 12px 22px; list-style: disc; }
.prose li { margin-bottom: 6px; }
.prose a { color: var(--caramel-deep, #7a4f2a); font-weight: 600; }
.updated { font-size: 13px; opacity: 0.7; margin-bottom: 22px; }
.footer {
  border-top: 1px solid var(--border, rgba(0, 0, 0, 0.08));
  padding: 22px 24px;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  font-size: 13px;
}
.footer a { color: inherit; text-decoration: none; opacity: 0.8; }
.footer a:hover { opacity: 1; }
.spacer { flex: 1; }
```

- [ ] **Step 4: Create `app/(legal)/layout.tsx`**

```tsx
import Link from "next/link";
import type { Metadata } from "next";
import styles from "./legal.module.css";

export const metadata: Metadata = {
  title: "Legal — Cortado",
};

export default function LegalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.wordmark}>Cortado</Link>
      </header>
      <main className={styles.main}>
        <div className={styles.disclaimer} role="note">
          ⚠️ <strong>Template.</strong> This is draft content for review with qualified counsel before you rely on it.
        </div>
        <article className={styles.prose}>{children}</article>
      </main>
      <footer className={styles.footer}>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/cookies">Cookies</Link>
        <span className={styles.spacer} />
        <Link href="/">← Back to Cortado</Link>
        <span>© 2026 Cortado</span>
      </footer>
    </div>
  );
}
```

- [ ] **Step 5: Run the layout test**

Run: `npx vitest run test/legal-pages.test.ts -t "layout"`
Expected: `-t "layout"` selects only the layout test, which now PASSES (the page tests are filtered out by the name match and are implemented in Tasks 4–6).

### Task 4: Privacy Policy page

**Files:**
- Create: `app/(legal)/privacy/page.tsx`

- [ ] **Step 1: Write the page (full tailored content; placeholders marked)**

```tsx
import styles from "../legal.module.css";

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className={styles.updated}>Last updated: 7 June 2026</p>

      <h2>1. Who we are</h2>
      <p>
        Cortado (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is operated by <strong>[PLACEHOLDER: controller legal name]</strong>.
        For any privacy question or request, contact <strong>[PLACEHOLDER: contact email]</strong>.
      </p>

      <h2>2. What we collect</h2>
      <p><strong>Account data.</strong> Your email address; for email/password sign-ups, your password stored
        only as a bcrypt hash (never in plain text); your display name; your public handle (username); an avatar
        colour (not an image); your bio; an email-verification timestamp; your account-creation time; and an
        internal counter we use to sign you out everywhere when you ask. If you
        sign in with Google or GitHub we also store that provider&rsquo;s name for your account and your account
        ID at that provider — we do <strong>not</strong> store any OAuth access or refresh tokens, and any avatar
        URL the provider supplies is stored but never displayed.</p>
      <p><strong>Your content.</strong> The coffee bags, brews and tasting notes (ratings, brew parameters, free
        text), comments, likes, follows, saved tastings and wishlist entries you create.</p>
      <p><strong>Technical data.</strong> Your IP address and email address are used to rate-limit sign-in and
        sign-up and are held only briefly (target ~15 minutes). An authentication cookie keeps you signed in (see
        our <a href="/cookies">Cookie Notice</a>). Email-verification links are stored as a keyed hash alongside
        your email for a target of 24 hours.</p>

      <h2>3. What is public and what is private</h2>
      <p><strong>Public</strong> to anyone: your display name, handle, avatar, bio, your reviews and comments, and
        your follower/following/review counts. <strong>Private</strong> (only you can see it): your email address,
        your password, and your bag-inventory details (bag weight, purchase date, amount remaining, and
        owned/where-bought).</p>

      <h2>4. Why we process your data</h2>
      <p>To provide the service, to authenticate you and keep the service secure (including rate-limiting), and to
        send you transactional verification email. <em>[PLACEHOLDER: confirm legal bases / consent model with
        counsel — e.g. contract, legitimate interest.]</em></p>

      <h2>5. Who we share data with</h2>
      <ul>
        <li><strong>Google / GitHub</strong> — only if you choose to sign in with them. They receive the sign-in
          request and return your profile (name, email, verified flag, avatar URL). For GitHub we additionally ask
          its API whether your primary email is verified.</li>
        <li><strong>Resend</strong> — our transactional email provider. It receives your email address and the
          message (e.g. a verification link) so we can deliver verification email. Used only when email sending is
          configured.</li>
        <li><strong>Hosting &amp; database</strong> — our application host <strong>[PLACEHOLDER: hosting provider +
          region]</strong> and our database <strong>[PLACEHOLDER: Postgres host — self-hosted or external managed
          provider + region]</strong>.</li>
      </ul>
      <p>We do <strong>not</strong> use analytics, advertising, tracking or session-replay services. We self-host
        our web fonts and never load an external avatar or image CDN.</p>

      <h2>6. How long we keep it</h2>
      <p>We keep your account and content until you delete your account. Verification links target a 24-hour
        lifetime and rate-limit records target ~15 minutes; these short-lived records are cleared on a best-effort
        basis, so treat those windows as targets after which the data becomes eligible for deletion rather than a
        guaranteed deletion deadline. Server logs are kept for <strong>[PLACEHOLDER: log retention period]</strong>.</p>

      <h2>7. Your rights and deleting your account</h2>
      <p>You can delete your account at any time from <a href="/settings">Settings</a>. This permanently deletes
        your account and your linked sign-in providers, your bags and the tastings/likes/saves/comments on them,
        and your own tastings, likes, comments, follows, saved tastings, wishlist and verification links.</p>
      <p><strong>Please note:</strong> a few records are not removed by deletion — rate-limit records that
        briefly hold your email/IP persist until their short prune window passes, and our server logs may contain
        your email or IP and are kept under the log-retention period above. Deleting your account also removes
        other people&rsquo;s likes, saves and comments on the content you had shared. To request a copy of your
        data, contact us at <strong>[PLACEHOLDER: how data-access/export requests are handled]</strong>.</p>

      <h2>8. Security</h2>
      <p>Passwords are bcrypt-hashed and your sessions are signed and encrypted. Your email and profile details
        are stored unencrypted at rest in our database. We enforce a strict Content-Security-Policy, HSTS and
        related security headers. <em>[PLACEHOLDER: confirm database transport encryption (TLS) posture if using
        an external database.]</em></p>

      <h2>9. Children</h2>
      <p>Cortado is not directed to children under <strong>[PLACEHOLDER: 13 / 16]</strong>.</p>

      <h2>10. International transfers</h2>
      <p>[PLACEHOLDER: describe any cross-border transfer and its safeguards.]</p>

      <h2>11. Changes</h2>
      <p>We may update this policy; we will revise the &ldquo;last updated&rdquo; date above.</p>

      <h2>12. Contact</h2>
      <p>[PLACEHOLDER: contact email].</p>
    </>
  );
}
```

- [ ] **Step 2: Run the privacy tests**

Run: `npx vitest run test/legal-pages.test.ts -t "privacy"`
Expected: `-t "privacy"` runs BOTH the "privacy page exists…" and the "privacy discloses…" content-grounding tests — both PASS.

- [ ] **Step 3: Commit** (after Tasks 5 & 6, one commit for the whole cut — see Task 6 Step 3).

### Task 5: Terms of Service page

**Files:**
- Create: `app/(legal)/terms/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import styles from "../legal.module.css";

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className={styles.updated}>Last updated: 7 June 2026</p>

      <h2>1. Acceptance and eligibility</h2>
      <p>By creating an account or using Cortado you agree to these Terms. You must be at least
        <strong> [PLACEHOLDER: minimum age]</strong> years old to use the service.</p>

      <h2>2. Your account</h2>
      <p>Provide accurate information, keep your credentials secure, and you are responsible for activity under
        your account.</p>

      <h2>3. Acceptable use</h2>
      <p>Do not post illegal or infringing content in your reviews, notes or photos; do not scrape, automate
        abuse of, or disrupt the service or other users.</p>

      <h2>4. Your content</h2>
      <p>You keep ownership of the content you create. You grant us a non-exclusive licence to host and display
        your content within the service so it works as intended. You are responsible for what you post.</p>

      <h2>5. Availability</h2>
      <p>The service is provided &ldquo;as is&rdquo; and we may change, suspend or discontinue features.</p>

      <h2>6. Termination</h2>
      <p>We may suspend or remove accounts that violate these Terms. You may delete your account at any time from
        <a href="/settings"> Settings</a>.</p>

      <h2>7. Disclaimers and liability</h2>
      <p>[PLACEHOLDER: disclaimers and limitation of liability — confirm with counsel.]</p>

      <h2>8. Governing law</h2>
      <p>[PLACEHOLDER: governing law and jurisdiction.]</p>

      <h2>9. Changes</h2>
      <p>We may update these Terms; we will revise the &ldquo;last updated&rdquo; date above.</p>

      <h2>10. Contact</h2>
      <p>[PLACEHOLDER: contact email].</p>
    </>
  );
}
```

- [ ] **Step 2: Run the terms test**

Run: `npx vitest run test/legal-pages.test.ts -t "terms"`
Expected: PASS.

### Task 6: Cookie Notice page

**Files:**
- Create: `app/(legal)/cookies/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import styles from "../legal.module.css";

export default function CookiesPage() {
  return (
    <>
      <h1>Cookie Notice</h1>
      <p className={styles.updated}>Last updated: 7 June 2026</p>

      <p>Cortado uses only the cookies it needs to sign you in and keep the service secure, plus one functional
        preference stored in your browser. Because we set no analytics, advertising or tracking cookies, there is
        no consent banner. All of our cookies are first-party, host-only, and <code>HttpOnly</code>; in production
        they are <code>Secure</code> and their names carry <code>__Secure-</code>/<code>__Host-</code> prefixes
        (the names below are shown without the prefix, as used in local development).</p>

      <h2>Strictly-necessary cookies</h2>
      <ul>
        <li><strong>authjs.session-token</strong> — keeps you signed in (a signed, encrypted session). Expires
          about 30 minutes after your last activity, refreshed as you use the app; large sign-ins may split it
          across numbered cookies (<code>.0</code>, <code>.1</code>, …).</li>
        <li><strong>authjs.csrf-token</strong> — protects sign-in requests against cross-site forgery. Deleted
          when you close your browser.</li>
        <li><strong>authjs.callback-url</strong> — remembers where to return you after sign-in. Deleted when you
          close your browser.</li>
        <li><strong>authjs.pkce.code_verifier, authjs.state, authjs.nonce</strong> — set only while you are
          actively signing in with Google or GitHub, to secure that exchange. Short-lived (about 15 minutes or
          less).</li>
      </ul>
      <p>Signing out clears these cookies.</p>

      <h2>Functional preference (not a cookie)</h2>
      <p>We store your light/dark theme choice under a <code>theme</code> key in your browser&rsquo;s
        <strong> localStorage</strong>. It stays until you clear your browser storage and is never sent to us.</p>

      <h2>What we do not use</h2>
      <p>We use no analytics, advertising or tracking cookies or trackers. If you sign in with Google or GitHub,
        those providers set their own cookies on their own sites under their own policies.</p>

      <p>See our <a href="/privacy">Privacy Policy</a> for how we handle your data.</p>
    </>
  );
}
```

- [ ] **Step 2: Run the full legal-pages test**

Run: `npx vitest run test/legal-pages.test.ts; echo "exit $?"`
Expected: all PASS, exit 0.

- [ ] **Step 3: Typecheck, build, then commit the whole cut**

Run: `npx tsc --noEmit; echo "tsc $?"` then `npm run build; echo "build $?"`
Expected: both exit 0 (build proves `/privacy`, `/terms`, `/cookies` render).

```bash
git add -A
git commit -m "feat(m4d): (legal) group — privacy, terms, cookie notice (audited template content)"
```

---

## Cut 3 — Discoverability surfaces

### Task 7: Signup agreement line

**Files:**
- Modify: `app/(app)/signup/signup-form.tsx`
- Test: `test/legal-links.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...s: string[]) => readFileSync(join(process.cwd(), ...s), "utf8");

describe("legal links are discoverable", () => {
  it("signup form links to terms and privacy", () => {
    const src = read("app/(app)/signup/signup-form.tsx");
    expect(src).toMatch(/href="\/terms"/);
    expect(src).toMatch(/href="\/privacy"/);
  });

  it("settings links to privacy, terms and cookies", () => {
    const src = read("components/settings.tsx");
    expect(src).toMatch(/href="\/privacy"/);
    expect(src).toMatch(/href="\/terms"/);
    expect(src).toMatch(/href="\/cookies"/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/legal-links.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the agreement line to `signup-form.tsx`**

Insert immediately after the closing `</form>` tag and before the existing "Have an account?" paragraph:

```tsx
      <p style={{ marginTop: 14, fontSize: 12.5, color: "var(--mocha)", lineHeight: 1.5 }}>
        By creating an account you agree to our{" "}
        <a href="/terms" style={{ color: "var(--espresso)", fontWeight: 600 }}>Terms</a> and{" "}
        <a href="/privacy" style={{ color: "var(--espresso)", fontWeight: 600 }}>Privacy Policy</a>.
      </p>
```

- [ ] **Step 4: Run the signup test**

Run: `npx vitest run test/legal-links.test.ts -t "signup"`
Expected: PASS.

### Task 8: Settings "Legal" section

**Files:**
- Modify: `components/settings.tsx`

- [ ] **Step 1: Read `components/settings.tsx`** to find the section layout/styling pattern and the last settings card, so the new section matches existing markup (cards, headings, `useData` is already in scope — do not change data flow).

- [ ] **Step 2: Add a "Legal" section** at the end of the settings content, matching the existing section/card pattern. Use plain `<a href>` links to `/privacy`, `/terms`, `/cookies` styled like the file's other links/rows. Example (adapt class/style names to the file's actual pattern observed in Step 1):

```tsx
      <section>
        <h2 /* match the file's section-heading style */>Legal</h2>
        <p><a href="/privacy">Privacy Policy</a></p>
        <p><a href="/terms">Terms of Service</a></p>
        <p><a href="/cookies">Cookie Notice</a></p>
      </section>
```

- [ ] **Step 3: Run the full legal-links test + typecheck**

Run: `npx vitest run test/legal-links.test.ts; echo "vitest $?"` then `npx tsc --noEmit; echo "tsc $?"`
Expected: both exit 0.

- [ ] **Step 4: Build + commit**

Run: `npm run build; echo "build $?"`

```bash
git add -A
git commit -m "feat(m4d): surface legal links in signup agreement + settings"
```

---

## Cut 4 — Live verification

### Task 9: Controller-driven live verification + green gate

Not a code task — the controller performs these; do not let a subagent fake them.

- [ ] **Step 1: Full automated gate**

Run (with `coffee-pg` up so the `integration` project runs, not just `unit`): `npm run test; echo "vitest $?"` · `npm run build; echo "build $?"` · `npm run lint; echo "lint $?"` · the Drizzle drift check (per the project's CI command). Expected: all green. (No migrations in M4·D, so drift should be unchanged — confirm.)

- [ ] **Step 2: Legal pages survive a DB outage**

Start the app (`npm run build && npm start`, prod build so error boundaries fire), then `docker stop coffee-pg`. Visit `/privacy`, `/terms`, `/cookies` → each returns 200 with full content and theme. Visit `/` → degrades to the root `error.tsx` (no hang). Then `docker start coffee-pg`.

- [ ] **Step 3: Regression — shell routes still work**

With the DB up: load `/bean/<id>` and `/roaster/<id>` (the audit-caught `useShell` routes) and confirm they render; load `/`, `/journal`, `/discover`, `/profile`, `/settings`, `/login`, `/signup`.

- [ ] **Step 4: CSP + links**

On a legal page, open devtools → **no CSP violation** in the console (nonce present, next-themes script allowed). Click the legal footer links; from `/signup` click the Terms/Privacy links; from `/settings` click the three legal links — all navigate correctly. **Toggle dark mode in the app, then open `/privacy` in the same browser:** confirm the shell, disclaimer box, and links are all legible in **both** themes (guards the CSS-variable fix).

- [ ] **Step 5: Done** — proceed to finishing-a-development-branch (PR), then post the `/code-review` summary comment per the milestone process.

---

## Self-review notes
- **Spec coverage:** restructure (Cut 1) ↔ spec File map; `(legal)` pages + content (Cut 2) ↔ spec Content spec; surfaces (Cut 3) ↔ spec Discoverability; live checks (Cut 4) ↔ spec Testing + Risks. Risk table items 1–6 each map to a step (move bean/roaster → Task 1/2 test; force-dynamic → Task 1 test; api at root → Task 1 test; legal scroll/spacing → Task 3 CSS; honest content → Task 4 test; 404 at root → Task 1 test).
- **No placeholders in the *plan*:** the only `[PLACEHOLDER]` tokens are intentional, in the rendered legal copy, for the owner.
- **Type/name consistency:** test file paths use the `app/(app)/...` and `app/(legal)/...` literal paths that the moves create; the CSS-module class names referenced in pages (`styles.updated`) exist in `legal.module.css`.
