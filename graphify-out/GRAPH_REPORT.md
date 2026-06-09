# Graph Report - /home/sbrn/Projects/Coffee-Tracker  (2026-06-09)

## Corpus Check
- Large corpus: 246 files · ~174,485 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 974 nodes · 1510 edges · 127 communities (90 shown, 37 thin omitted)
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 268 edges (avg confidence: 0.8)
- Token cost: 955,735 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core Data & Server Actions|Core Data & Server Actions]]
- [[_COMMUNITY_Data Export & Feed Queries|Data Export & Feed Queries]]
- [[_COMMUNITY_UI Component Library|UI Component Library]]
- [[_COMMUNITY_Auth, Registration & Rate Limiting|Auth, Registration & Rate Limiting]]
- [[_COMMUNITY_SEO & Public Pages|SEO & Public Pages]]
- [[_COMMUNITY_Account Linking & Settings|Account Linking & Settings]]
- [[_COMMUNITY_Pagination & Query Layer|Pagination & Query Layer]]
- [[_COMMUNITY_DB Migrations & M4 Specs|DB Migrations & M4 Specs]]
- [[_COMMUNITY_App Router Pages & Shell|App Router Pages & Shell]]
- [[_COMMUNITY_Coverage Auth & DSAR Tests|Coverage: Auth & DSAR Tests]]
- [[_COMMUNITY_DB Schema & Readiness|DB Schema & Readiness]]
- [[_COMMUNITY_Integration Test Harness|Integration Test Harness]]
- [[_COMMUNITY_Middleware & CSP Security|Middleware & CSP Security]]
- [[_COMMUNITY_Detail & Card Components|Detail & Card Components]]
- [[_COMMUNITY_DB Pool, SSL & Env|DB Pool, SSL & Env]]
- [[_COMMUNITY_Form Input Components|Form Input Components]]
- [[_COMMUNITY_Scoped-Query Integration Tests|Scoped-Query Integration Tests]]
- [[_COMMUNITY_M2M3 Social & Migration Plans|M2/M3 Social & Migration Plans]]
- [[_COMMUNITY_Profile Pages & Auth Helper|Profile Pages & Auth Helper]]
- [[_COMMUNITY_Roaster SEO & Metadata|Roaster SEO & Metadata]]
- [[_COMMUNITY_Public Profile Tests & Handles|Public Profile Tests & Handles]]
- [[_COMMUNITY_M3-M5 CI & Security Plans|M3-M5 CI & Security Plans]]
- [[_COMMUNITY_Logging & Security Headers|Logging & Security Headers]]
- [[_COMMUNITY_shadcn UI Primitives|shadcn UI Primitives]]
- [[_COMMUNITY_Bag Form & Flavor Wheel|Bag Form & Flavor Wheel]]
- [[_COMMUNITY_Auth.js Design Specs|Auth.js Design Specs]]
- [[_COMMUNITY_M1 Data Integrity Specs|M1 Data Integrity Specs]]
- [[_COMMUNITY_M3-B Ops & Deploy Hardening|M3-B Ops & Deploy Hardening]]
- [[_COMMUNITY_Relative Time & Load-More|Relative Time & Load-More]]
- [[_COMMUNITY_Legal Pages & Signup|Legal Pages & Signup]]
- [[_COMMUNITY_Account-Linking Tests|Account-Linking Tests]]
- [[_COMMUNITY_M4 Lifecycle & Verification Specs|M4 Lifecycle & Verification Specs]]
- [[_COMMUNITY_Dialog & Log Sheet|Dialog & Log Sheet]]
- [[_COMMUNITY_Accessibility Structure Tests|Accessibility Structure Tests]]
- [[_COMMUNITY_getAppData Scoping & Profiles Plan|getAppData Scoping & Profiles Plan]]
- [[_COMMUNITY_Loading & Skeleton UI|Loading & Skeleton UI]]
- [[_COMMUNITY_Flavor Wheel & Accordion|Flavor Wheel & Accordion]]
- [[_COMMUNITY_M5 SEO & Legal Plans|M5 SEO & Legal Plans]]
- [[_COMMUNITY_Contrast-Check Color Math|Contrast-Check Color Math]]
- [[_COMMUNITY_Brew & Bag Validation|Brew & Bag Validation]]
- [[_COMMUNITY_GET|GET]]
- [[_COMMUNITY_libseed-data FLAVORS  FLAVOR_COLORS|lib/seed-data FLAVORS / FLAVOR_COLORS /]]
- [[_COMMUNITY_bean|bean]]
- [[_COMMUNITY_POST|POST]]
- [[_COMMUNITY_p|p]]
- [[_COMMUNITY_p|p]]
- [[_COMMUNITY_p|p]]
- [[_COMMUNITY_comment-validation.test|comment-validation.test]]
- [[_COMMUNITY_PWA theme colors, standalone manifest|PWA: theme colors, standalone manifest]]
- [[_COMMUNITY_data-export.test.ts|data-export.test.ts]]
- [[_COMMUNITY_signIn callback|signIn callback]]
- [[_COMMUNITY_signup-validation.test|signup-validation.test]]
- [[_COMMUNITY_relativeTime|relativeTime]]
- [[_COMMUNITY_resolveSslConfig|resolveSslConfig]]
- [[_COMMUNITY_makeWithTransaction|makeWithTransaction]]
- [[_COMMUNITY_clientIp X-Forwarded-For parser|clientIp X-Forwarded-For parser]]
- [[_COMMUNITY_githubEmailVerified GitHub primary-email check|githubEmailVerified GitHub primary-email check]]
- [[_COMMUNITY_JSON-LD builders + safe serializer|JSON-LD builders + safe serializer]]
- [[_COMMUNITY_OpenGraphTwitter image routes|OpenGraph/Twitter image routes]]
- [[_COMMUNITY_libregister-errors.ts|lib/register-errors.ts]]
- [[_COMMUNITY_session callback|session callback]]
- [[_COMMUNITY_Warm OKLCH design system|Warm OKLCH design system /]]
- [[_COMMUNITY_Portable Claude Code tooling|Portable Claude Code tooling]]
- [[_COMMUNITY_health GET|health GET]]
- [[_COMMUNITY_csp-report POST|csp-report POST]]
- [[_COMMUNITY_AuthLayout|AuthLayout]]
- [[_COMMUNITY_BeanRating|BeanRating]]
- [[_COMMUNITY_TRUSTED_PROXY_HOPS|TRUSTED_PROXY_HOPS]]
- [[_COMMUNITY_THEME_LIGHT|THEME_LIGHT]]
- [[_COMMUNITY_THEME_DARK|THEME_DARK]]
- [[_COMMUNITY_Comment|Comment]]
- [[_COMMUNITY_isFeedTab|isFeedTab]]
- [[_COMMUNITY_verification_tokens table|verification_tokens table]]
- [[_COMMUNITY_link_tokens table|link_tokens table]]
- [[_COMMUNITY_smoke.test|smoke.test]]
- [[_COMMUNITY_stubsserver-only.ts|stubs/server-only.ts]]
- [[_COMMUNITY_PWA app icon  a|PWA app icon : a]]

## God Nodes (most connected - your core abstractions)
1. `query()` - 60 edges
2. `requireVerifiedUserId()` - 20 edges
3. `useShell()` - 18 edges
4. `cn()` - 16 edges
5. `requireUserId()` - 16 edges
6. `Migration 0000 init (baseline schema)` - 15 edges
7. `registerUser()` - 14 edges
8. `cn (class merge util)` - 14 edges
9. `TastingCard` - 13 edges
10. `getPublicBaseUrl()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `Skeleton` --semantically_similar_to--> `Absent production infrastructure (error boundaries, CI, migrations, pagination)`  [INFERRED] [semantically similar]
  components/skeleton.tsx → docs/2026-06-05-production-readiness-report.md
- `PWA install icon (192x192) depicting a coffee bean — caramel/tan bean with a cream center crease on a dark espresso-brown rounded-square background; the maskable app icon referenced by the web manifest` ----> `manifest()`  [0.85]
  public/icons/icon-192.png → app/manifest.ts
- `Maskable PWA app icon (512x512 PNG) depicting a tan coffee bean with a lighter center crease on a dark brown background, centered with safe-zone padding so Android adaptive-icon masks can crop it without clipping; referenced by the web manifest with purpose "maskable"` --conceptually_related_to--> `manifest()`  [0.85]
  public/icons/maskable-512.png → app/manifest.ts
- `Bean/Bag and Tasting/Brew data model` --conceptually_related_to--> `logBrew()`  [INFERRED]
  README.md → app/actions.ts
- `Bean/Bag and Tasting/Brew data model` --conceptually_related_to--> `addBag()`  [INFERRED]
  README.md → app/actions.ts

## Hyperedges (group relationships)
- **Auth security posture (rate-limit + timing-safe + revocation)** — concept_dual_rate_limit, concept_timing_safe_login, concept_session_version_revocation, auth_authorize, auth_jwt_callback [INFERRED 0.85]
- **force-static metadata segments escaping force-dynamic cascade** — manifest_manifest, apple_icon_appleicon, opengraph_image_ogdefault, concept_per_request_nonce_csp [INFERRED 0.75]
- **Idempotent toggle write actions** — actions_togglelike, actions_togglefollowuser, actions_togglefollowroaster, actions_togglesavetasting, actions_togglewishlistbean [INFERRED 0.85]
- **Client pages consuming the AppProvider shell context** — bean_client_beanclient, discover_client_discoverinner, journal_client_journalclient [INFERRED 0.75]
- **Session-version bump on credential change/sign-out-everywhere** — account_link_actions_bumpandkeepcurrent, account_actions_signoutalldevices, account_actions_deleteaccount [INFERRED 0.75]
- **Bean route segment: page + client + loading + og image** — page_beanpage, bean_client_beanclient, opengraph_image_beanog [INFERRED 0.75]
- **Legal document set (config-driven facts)** — privacy_page, terms_page, legal_facts [EXTRACTED 0.95]
- **Signup flow (form to server action)** — signup_page, signup_form, auth_actions_register_user [INFERRED 0.85]
- **User profile server-to-client render chain** — user_profile_page, user_profile_client, profile_view [INFERRED 0.85]
- **shadcn/ui design-system primitives** — ui_button, ui_dialog, ui_badge [INFERRED 0.75]
- **Feed/journal card composition stack** — screens_feed_screen, cards_tasting_card, comment_thread_component [INFERRED 0.75]
- **Social join tables (likes/follows/saves)** — db_table_likes, db_table_user_follows, db_table_tasting_saves [INFERRED 0.75]
- **M3 ops/quality subsystem (CI, ops, migrations, pagination)** — 2026_06_06_m3_ci_quality_gates_plan, 2026_06_06_m3b_ops_hardening_plan, 2026_06_06_m3c_drizzle_migrations_plan [EXTRACTED 1.00]
- **M4 account/security hardening phase** — 2026_06_06_m4a_account_lifecycle_plan, 2026_06_07_m4b_security_hardening_plan, 2026_06_07_m4c_email_verification_plan [INFERRED 0.85]
- **M5 SEO/a11y/PWA polish phase** — 2026_06_07_m5a_catalog_seo_plan, 2026_06_08_m5b_accessibility_plan, 2026_06_08_m5c_pwa_polish_plan [INFERRED 0.85]
- **M3 sub-projects (Ops, Migrations, Pagination, Scoping)** — m3b_ops_hardening_design, m3c_drizzle_migrations_design, m3d_pagination_design, m3d2_scope_getappdata_design [INFERRED 0.85]
- **M4 auth hardening & compliance sub-projects** — m4a_account_lifecycle_design, m4b_security_headers_rate_limit_design, m4c_email_verification_design, m4d_legal_compliance_design [INFERRED 0.85]
- **Keyset pagination: composite indexes + tastings/beans** — index_tastings_created_id_idx, index_beans_created_id_idx, m3d_pagination_design [INFERRED 0.75]
- **Email verification flow** — verify_email_sendverificationemail, email_sendemail, public_url_getpublicbaseurl [INFERRED 0.85]
- **DB pool + query + transaction seam** — db_pool, db_query, db_withtransaction [EXTRACTED 0.85]
- **Write-path auth gate (revocation + verified email)** — auth_requireverifieduserid, auth_guard_resolveuserorthrow, auth_guard_iswriteallowed [INFERRED 0.85]
- **Keyset pagination cursor codec** — pagination_encodecursor, pagination_decodecursor, pagination_topage [INFERRED 0.75]
- **Per-request rate limiting (IP + store + warn)** — rate_limit_checkratelimit, request_ip_clientip, rate_limit_warnifunknownip [INFERRED 0.75]
- **Handle generate + validate + reserved** — generate_handle_generatehandle, handles_isvalidhandle, handles_reserved_handles [INFERRED 0.75]
- **Keyset cursor pagination** — pagination_decode_cursor, queries_get_feed_page, pagination_to_page [INFERRED 0.85]
- **DSAR export + PII erasure** — data_export_get_data_export, users_repo_delete_user_with_pii, schema_users [INFERRED 0.75]
- **Owner-scoped projection guards** — projection_guard_test, bean_projection_guard_test, compute_on_read_test [INFERRED 0.75]
- **Security headers + CSP + rate-limit subsystem tests** — test_csp_report, test_middleware, test_security_headers [INFERRED 0.85]
- **Email verification flow tests** — test_verify_actions, test_verify_email, test_verify_route [INFERRED 0.85]
- **SEO / PWA surface tests** — test_robots, test_pwa, test_og_routes [INFERRED 0.75]
- **Integration tests sharing the scratch-DB harness** — test_int_constraints, test_int_pagination, test_int_scoped_queries [INFERRED 0.85]
- **Integration tests sharing the scratch-DB harness (feature lane)** — test_int_account_deletion, test_int_rate_limit, test_int_account_linking [INFERRED 0.85]
- **Public-profile feature test suite (unit + integration)** — test_public_profiles, test_int_public_profiles, test_sitemap [INFERRED 0.80]
- **GDPR compliance flow: DSAR export + right-to-erasure PII purge** — gdpr_dsar, gdpr_right_to_erasure, data_export_module, users_repo_module [INFERRED 0.75]

## Communities (127 total, 37 thin omitted)

### Community 0 - "Core Data & Server Actions"
Cohesion: 0.07
Nodes (55): addBag(), addComment(), deleteBag(), deleteBrew(), deleteComment(), fetchComments(), logBrew(), toggleFollowRoaster() (+47 more)

### Community 1 - "Data Export & Feed Queries"
Cohesion: 0.05
Nodes (58): loadMoreFeed, actions-pagination.test, getCurrentUserId, bean-projection-guard.test, compute-on-read.test, getDataExport, isEmpty, get-current-user-id.test (+50 more)

### Community 2 - "UI Component Library"
Cohesion: 0.06
Nodes (58): signOutAllDevices / deleteAccount, linkOAuthStart/unlinkOAuth/setPassword/removePassword, addBag action, loadMoreFeed/Beans/BeanReviews/RoasterBeans, /api/export (DSAR JSON download), AppProvider, Scroll restoration (main-scroll), ShellContext (+50 more)

### Community 3 - "Auth, Registration & Rate Limiting"
Cohesion: 0.06
Nodes (30): registerUser(), signOutAction(), resendVerification(), Credentials authorize callback, jwt callback (session_version stamping), Auth.js v5 (next-auth beta) authentication, Dual email+IP rate limiting on auth endpoints, Provider email-verified trust policy (+22 more)

### Community 4 - "SEO & Public Pages"
Cohesion: 0.07
Nodes (25): robots(), onRequestError(), register(), Bare instrumentation module for secret-less CI build, force-dynamic robots/sitemap for runtime AUTH_URL, generateMetadata(), generateMetadata(), validateEnv() (+17 more)

### Community 5 - "Account Linking & Settings"
Cohesion: 0.1
Nodes (26): deleteAccount(), signOutAllDevices(), bumpAndKeepCurrent(), linkOAuthStart(), removePassword(), setPassword(), unlinkOAuth(), setDiscoverable() (+18 more)

### Community 6 - "Pagination & Query Layer"
Cohesion: 0.11
Nodes (30): loadMoreFeed(), sitemap(), GET(), getDataExport(), clampLimit(), decodeCursor(), encodeCursor(), toPage() (+22 more)

### Community 7 - "DB Migrations & M4 Specs"
Cohesion: 0.08
Nodes (37): Account-Linking design, users.discoverable column, Migration 0000 init (baseline schema), Migration 0001 pagination indexes, Migration 0002 account deletion cascade, Migration 0003 rate_limits table, Migration 0005 public profiles (discoverable + handle index), beans_created_id_idx composite keyset index (+29 more)

### Community 8 - "App Router Pages & Shell"
Cohesion: 0.09
Nodes (25): loadMoreUserTastings(), AppLayout(), FeedInner(), FeedPage(), BeanClient, AppProvider(), useShell(), DiscoverClient() (+17 more)

### Community 9 - "Coverage: Auth & DSAR Tests"
Cohesion: 0.1
Nodes (35): Server actions (logBrew/addBag/updateBrew/...), Pure auth-guard logic (resolveUserOrThrow/isLiveSession/isWriteAllowed), Auth helpers (requireUserId/requireVerifiedUserId/getCurrentUserId), Auth.js root config (auth()), lib/data-export.ts (getDataExport), data-export.test.ts (DSAR export integration test), Database query helper, delete-pii.test.ts (PII purge on deletion integration test) (+27 more)

### Community 10 - "DB Schema & Readiness"
Cohesion: 0.08
Nodes (30): fetchComments/addComment/updateComment/deleteComment, logBrew action, toggleFollowUser/Roaster/saveTasting/wishlistBean, toggleLike action, optimisticToggle, AppProvider.toggleLike, ThemeProvider(), schema.sql (HISTORICAL, superseded by Drizzle) (+22 more)

### Community 11 - "Integration Test Harness"
Cohesion: 0.16
Nodes (10): client(), client(), admin(), allMigrationsSql(), baseUrl(), dropDb(), freshDbWithSql(), testPool() (+2 more)

### Community 12 - "Middleware & CSP Security"
Cohesion: 0.14
Nodes (16): Error(), manifest(), AppleIcon image, middleware(), Per-request nonce CSP requires dynamic rendering, GlobalError boundary (root), PWA install icon (192x192) depicting a coffee bean — caramel/tan bean with a cream center crease on a dark espresso-brown rounded-square background; the maskable app icon referenced by the web manifest, App icon (favicon): coffee bean on dark-brown rounded square — Coffee-Tracker PWA brand mark (+8 more)

### Community 13 - "Detail & Card Components"
Cohesion: 0.15
Nodes (8): loadMoreBeanReviews(), loadMoreRoasterBeans(), Avatar(), BeanRating(), flavorColor(), Avatar(), AvatarFallback(), Badge()

### Community 14 - "DB Pool, SSL & Env"
Cohesion: 0.12
Nodes (11): app/(legal)/cookies/page.tsx, app/(legal)/privacy/page.tsx, app/(legal)/terms/page.tsx, pool, createPool(), makeWithTransaction(), resolveSslConfig(), lib/env.ts (+3 more)

### Community 15 - "Form Input Components"
Cohesion: 0.14
Nodes (3): Input(), Label(), Slider()

### Community 16 - "Scoped-Query Integration Tests"
Cohesion: 0.19
Nodes (13): app/account-actions.ts, lib/auth.ts, lib/db.ts, lib/rate-limit.ts, lib/users-repo.ts, integration/account-deletion.test.ts, integration/constraints.test.ts, integration/_db.ts (+5 more)

### Community 17 - "M2/M3 Social & Migration Plans"
Cohesion: 0.15
Nodes (14): Compute-on-read counts (derived in SQL, never stored-as-truth), M2 Social Layer Design Spec, Real Following feed (server query on follow graph), Lazy per-tasting comment thread (load on expand, never in getAppData), M2 Social Layer Implementation Plan, Typed FK join tables (follows/saves/wishlist/comments), GitHub Actions gate (tsc+vitest+eslint+build) + Dependabot + Node pin, Real-Postgres fidelity gate (catalog-equivalence vs db/schema.sql) (+6 more)

### Community 18 - "Profile Pages & Auth Helper"
Cohesion: 0.18
Nodes (13): loadMoreUserTastings, signIn, getCurrentUserId, json-ld, LoginPage, ProfileView, RoasterClient, RoasterLoading (+5 more)

### Community 19 - "Roaster SEO & Metadata"
Cohesion: 0.18
Nodes (12): app/sitemap.ts, queries, seo (roasterMetadata, userMetadata), theme-colors (THEME_LIGHT), RoasterOg, generateMetadata (roaster), roaster twitter-image (re-export), SettingsClient (+4 more)

### Community 20 - "Public Profile Tests & Handles"
Cohesion: 0.18
Nodes (9): app/(app)/layout.tsx, app/(auth)/layout.tsx, app/(app)/discover/page.tsx, app/profile-actions.ts, app/layout.tsx, lib/generate-handle.ts, lib/handles.ts, computeTopFlavors (+1 more)

### Community 21 - "M3-M5 CI & Security Plans"
Cohesion: 0.15
Nodes (13): Fixed-window in-memory rate limiter, M3-A CI/CD & Quality Gates Design Spec, Flat-config ESLint (app code only), Isolated next 15.5.19 security bump (clears critical RCE), M3-A CI/CD & Quality Gates Implementation Plan, Nonce-based strict CSP + security headers via middleware, Postgres-backed rate limiter + trusted XFF client IP, M4-B Security Headers + Shared Rate Limiter Plan (+5 more)

### Community 22 - "Logging & Security Headers"
Cohesion: 0.18
Nodes (12): POST /api/csp-report endpoint, validateEnv environment validator, Structured logger (warn/error/info/debug), Next.js middleware (security headers + nonce), getPublicBaseUrl resolver, robots.txt route, Security headers + CSP builder (generateNonce/buildCsp/staticSecurityHeaders), CSP-report route logs violation and returns 204 even on malformed body (+4 more)

### Community 24 - "Bag Form & Flavor Wheel"
Cohesion: 0.25
Nodes (11): BagForm, BeanBag, DataProvider, useData, DonePanel, FlavorWheelPicker, flavor-wheel data (FLAVOR_WHEEL, WHEEL_FLAT), seed-data (flavorColor, ROAST_LEVELS) (+3 more)

### Community 25 - "Auth.js Design Specs"
Cohesion: 0.24
Nodes (10): Auth.js v5 Authentication Design Spec, Threat model: shared-email account takeover vector, DUMMY_HASH timing-safe no-user login (anti-enumeration), Public browse, gated writes (route to /login), JWT session strategy, no DB adapter (Approach A), Auth.js v5 Authentication Implementation Plan, Identity keyed on (provider, providerAccountId), never email, Lazy-init auth.ts + per-provider link-nonce cookie in signIn callback (+2 more)

### Community 26 - "M1 Data Integrity Specs"
Cohesion: 0.22
Nodes (10): M1 Data Integrity & Write Path Design Spec, Ownership-guarded edit/delete Server Actions, Honest submit states (awaited actions, no false success), M1 Data Integrity & Core Write Path Implementation Plan, Hand-rolled brew/bag validation + numeric normalization (no Zod), Per-User Bag Ownership Design Spec, getBeans redacts private bag fields for non-owners (SQL CASE), logBrew atomic ownership guard (insert-select from owned beans) (+2 more)

### Community 27 - "M3-B Ops & Deploy Hardening"
Cohesion: 0.22
Nodes (10): App Router error boundaries (no empty-data fallback), Hardened pg pool + env-driven SSL, Startup env validation via instrumentation.ts (never at build), M3-B Ops / Deploy Hardening Implementation Plan, Structured-JSON logger + Sentry seam at onRequestError, Cortado Deployment (Coolify + Railpack), Multi-stage Dockerfile (node:24-alpine, non-root, next start), /api/health liveness check (not DB-readiness) (+2 more)

### Community 28 - "Relative Time & Load-More"
Cohesion: 0.25
Nodes (4): loadMoreBeans(), run(), useLoadMore(), relativeTime()

### Community 29 - "Legal Pages & Signup"
Cohesion: 0.31
Nodes (9): registerUser, CookiesPage, legal (config facts), LegalLayout, PrivacyPage, SignupForm, TermsPage, (legal) group: DB-independent layout/pages, real processors, honest deletion caveats, real cookies (+1 more)

### Community 30 - "Account-Linking Tests"
Cohesion: 0.25
Nodes (6): app/account-link-actions.ts, app/(auth)/signup/signup-form.tsx, components/settings.tsx, lib/account-link-repo.ts, lib/link-tokens.ts, integration/account-linking.test.ts

### Community 31 - "M4 Lifecycle & Verification Specs"
Cohesion: 0.22
Nodes (9): requireUserId/getCurrentUserId authorization boundary, session_version write-path revocation, Cascade account self-delete (flip last non-cascade user FKs), M4-A Account Lifecycle & Revocation Implementation Plan, Read-path revocation (isLiveSession; cache-memoized getCurrentUserId), signOutAllDevices + deleteAccount Server Actions; /settings route, Write-gate via live DB read (requireVerifiedUserId), not JWT flag, M4-C Email Verification Implementation Plan (+1 more)

### Community 33 - "Accessibility Structure Tests"
Cohesion: 0.25
Nodes (7): app/globals.css, app/(legal)/layout.tsx, components/app-provider.tsx, components/detail.tsx, components/log-sheet.tsx, components/screens.tsx, components/ui.tsx

### Community 34 - "getAppData Scoping & Profiles Plan"
Cohesion: 0.29
Nodes (7): useOptimistic re-base over initialData + revalidatePath reconciliation, Optimistic Set<string> toggles + revalidatePath reconciliation, M3-D-2 Slim getAppData + Per-Screen Scoping Plan, discover/bean/roaster convert to server-fetch + client-render, Remove unbounded global arrays from getAppData; per-screen scoping, Public Profiles Implementation Plan, Public /u/[handle] route (CI handle resolve, 308 canonical, notFound)

### Community 36 - "Flavor Wheel & Accordion"
Cohesion: 0.47
Nodes (3): Accordion(), AccordionItem(), AccordionTrigger()

### Community 37 - "M5 SEO & Legal Plans"
Cohesion: 0.33
Nodes (6): M4-D Legal / Compliance Pages Implementation Plan, Architecture B: DB-independent root layout; (app)/(legal) route groups, generateMetadata + canonicals + robots/sitemap + JSON-LD + OG images, M5-A Catalog SEO & Social Cards Implementation Plan, getPublicBaseUrl origin helper (prod AUTH_URL fail-fast), users.discoverable opt-in indexing flag (gates JSON-LD/robots/sitemap/OG)

### Community 38 - "Contrast-Check Color Math"
Cohesion: 0.47
Nodes (5): oklchToLinRgb, relLum, oklchToLinRgb(), ratio(), relLum()

### Community 39 - "Brew & Bag Validation"
Cohesion: 0.33
Nodes (6): normalizeDose, normalizeRatio, normalizeTemp, brew-validation.test, validateAddBag, validateLogBrew

### Community 42 - "lib/seed-data FLAVORS / FLAVOR_COLORS /"
Cohesion: 0.5
Nodes (3): lib/brew-validation validators, lib/flavor-wheel FLAVOR_WHEEL / WHEEL_FLAT, lib/seed-data FLAVORS / FLAVOR_COLORS / BREW_METHODS

### Community 48 - "comment-validation.test"
Cohesion: 0.67
Nodes (3): comment-validation.test, validateComment, validateUpdateComment

### Community 49 - "PWA: theme colors, standalone manifest"
Cohesion: 0.67
Nodes (3): Web app manifest route, PWA: theme colors, standalone manifest with icons, force-static, skeleton leaves min-height, Shared PWA theme color constants

## Ambiguous Edges - Review These
- `beanJsonLd()` → `computeTopFlavors()`  [AMBIGUOUS]
  lib/profile-flavors.ts · relation: conceptually_related_to

## Knowledge Gaps
- **193 isolated node(s):** `signIn callback (account-linking)`, `session callback`, `twitter-image re-export`, `GlobalError boundary (root)`, `Timing-safe credential check (no user enumeration)` (+188 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `beanJsonLd()` and `computeTopFlavors()`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `query()` connect `Core Data & Server Actions` to `Data Export & Feed Queries`, `Auth, Registration & Rate Limiting`, `Account Linking & Settings`, `Pagination & Query Layer`, `DB Pool, SSL & Env`?**
  _High betweenness centrality (0.162) - this node is a cross-community bridge._
- **Why does `Avatar()` connect `Detail & Card Components` to `Core Data & Server Actions`, `UI Component Library`?**
  _High betweenness centrality (0.148) - this node is a cross-community bridge._
- **Why does `cn (class merge util)` connect `UI Component Library` to `Detail & Card Components`?**
  _High betweenness centrality (0.138) - this node is a cross-community bridge._
- **Are the 14 inferred relationships involving `query()` (e.g. with `updateBrew()` and `deleteBrew()`) actually correct?**
  _`query()` has 14 INFERRED edges - model-reasoned connections that need verification._
- **Are the 15 inferred relationships involving `requireVerifiedUserId()` (e.g. with `logBrew()` and `addBag()`) actually correct?**
  _`requireVerifiedUserId()` has 15 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `useShell()` (e.g. with `FeedInner()` and `DiscoverInner()`) actually correct?**
  _`useShell()` has 6 INFERRED edges - model-reasoned connections that need verification._