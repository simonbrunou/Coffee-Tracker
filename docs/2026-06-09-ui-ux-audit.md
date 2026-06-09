# Cortado — Full UI/UX Audit (Desktop + Mobile)

**Date:** 2026-06-09
**Method:** Live audit of the running app with seeded content. 25 screenshots captured at **desktop (1440×900)** and **mobile (390×844)** across every surface (Feed, Discover, Journal, Profile, Settings, Bean detail, Roaster detail, public profile `/u/[handle]`, Login, Signup, Legal, and the Log-brew + Add-bag bottom-sheets). 12 specialist agents reviewed code + screenshots across accessibility, responsive, design-system, typography, color/dark-mode, motion, IA/navigation, UX flows, microcopy, states, forms, and performance; each finding then went through adversarial verification. 77 raw findings → 31 formally verified; a transient server rate-limit dropped ~45 from auto-verification, the high-value ones of which were verified by hand (and several refuted).

---

## Verdict

**A genuinely distinctive, well-crafted visual foundation — undermined by consistency, completeness, and accessibility gaps.** The warm OKLCH "cafe" palette, the Spectral + Hanken type pairing, the Discover grid and Bean-detail page are real design quality (this is *not* AI slop). But token discipline is inconsistent (an undefined danger color, 64 hardcoded font sizes, monospace misuse), the **desktop sidebar footer is visibly broken on every screen**, and **Settings / Sign-out are unreachable on mobile**. Fixing ~6 structural issues would lift the whole product a tier.

### Scorecard (0–4)

| Dimension | Score | Headline |
|---|:---:|---|
| Accessibility (WCAG 2.2 AA) | **2** | Real AA contrast failures (sage "On shelf" ~3.3:1; danger red 2.9:1 in dark) |
| Responsive & Layout | **2** | Sidebar footer overflows 240px; Settings unreachable on mobile |
| Design-system consistency | **2** | Strong tokens undercut by inline-style sprawl + undefined `--berry` + radius drift |
| Typography | **2** | No type scale (64 hardcoded px sizes); brand micro-labels render in OS monospace |
| Color & Theming / Dark mode | **2** | Undefined danger token, 3 reds for one meaning, gold rating token unused |
| Motion & micro-interactions | **3** | Solid (reduced-motion handled, ease-out); minor stagger/pressed-state gaps |
| IA & Navigation | **2** | No mobile path to Settings or Sign-out |
| UX Flows & friction | **3** | Mostly clear; verify-gate friction + no undo on delete |
| Microcopy / UX writing | **3** | Good voice; small inconsistencies (success titles, CTA verbs) |
| Empty / Loading / Error states | **2** | Sparse new-user empty states; hydration error on detail pages |
| Forms & input UX | **2** | No required-field markers; free-text brew params; no autofocus |
| Performance (code-level) | **2** | Whole dataset shipped to one client provider; hydration re-render |
| **Overall** | **27/48** | Strong vision, execution gaps. Address P1s + the cross-cutting token/typography debt. |

---

## P1 — Major (fix before release)

### 1. Desktop sidebar account footer overflows the 240px column on every screen
**Where:** `components/app-provider.tsx:357–385` · `.sidebar` `app/globals.css:230` · visible in every `d-*` screenshot.
The footer crams four items into one flex row inside a ~204px-usable sidebar: the user button (Avatar 36 + name + `@handle`), a Settings icon button, a text **"Sign out"** button, and the theme toggle. The name column collapses, so "Mobile Review" **wraps to two lines and overprints "Sign out" and the handle** — the single most-seen chrome element renders as illegible overlap.
**Fix:** Don't compete for one row. Put the user identity on its own full-width row (with `min-width:0` + `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` so it truncates), and move Settings / Sign-out / theme to a second row — or drop the inline "Sign out" text button entirely (Sign-out already lives in Settings).

### 2. Settings and Sign-out are unreachable on mobile
**Where:** only link to `/settings` is the desktop sidebar gear (`app-provider.tsx:370`, inside `.sidebar { display:none }` below 880px). Mobile top bar (`:391–412`) and bottom nav (`:426–436`, Feed/FAB/Journal/Discover/Profile) expose neither Settings nor Sign-out; the Profile screen's only action is a **disabled** "Edit" button (`detail.tsx:569–572`). Confirmed in `m-profile.png` / `m-settings.png`.
**Impact:** Mobile-only users cannot reach **Delete account, Sign-out-everywhere, public-profile indexing, sign-in-method linking, or DSAR data export** — and cannot sign out at all.
**Fix:** Add a gear to the `.mobile-top` header (next to theme/search) and/or a Settings link on the Profile header when `isOwn`; ensure Sign-out is reachable on mobile.

### 3. `--berry` is an undefined token — destructive/error text falls back to a hardcoded red that fails AA in dark mode
**Where:** `var(--berry, #a8434a)` in `cards.tsx:205`, `detail.tsx:221`, `comment-thread.tsx:73`, `log-sheet.tsx:324`, `bag-form.tsx:257` — but `--berry` is **never defined** in `:root` or `.dark`, so the literal `#a8434a` always wins. On the dark card surface that is **2.9:1** (fails AA 4.5:1 for these ~12.5px labels), and it can't theme.
**Impact:** "Delete?" confirms and inline error alerts — the last safeguard before irreversible deletes — are the *least* legible text in dark mode.
**Fix:** Define `--berry` (and consolidate the three different reds) in both `:root` and `.dark` as proper OKLCH tokens that hit AA on card surfaces; replace the inline error red likewise.

> **Also elevated to P1 (verified by hand, dropped from auto-verify by the rate-limit):**
> ### 4. React hydration mismatch on every detail page
> **Where:** `lib/relative-time.ts:3` defaults `nowMs = Date.now()`, called un-pinned at `cards.tsx:35`; compounded by locale-dependent `toLocaleString()` in `detail.tsx:495,685`. Server and client render "time ago" / formatted numbers at different instants/locales → "server rendered HTML didn't match client properties" (the dev overlay shows **"1 Issue"** on `d-bean`).
> **Impact:** React discards the server tree and re-renders on the client (wasted INP, flicker risk), and it's a latent correctness bug.
> **Fix:** Pass a single server-computed timestamp down (or render relative time in a `useEffect`/client-only boundary), and pin a locale on `toLocaleString` (or format server-side).

---

## P2 — Minor (worth fixing)

**Accessibility / contrast**
- **Sage-green "On shelf" / "Saved" labels fail AA** (~3.2–3.5:1) as small text on light surfaces (`d-discover`, feed save state). Darken the sage or enlarge/bolden the label.
- The interactive **bean-rating radiogroup** is labelled only "Rating" and isn't tied to its visible "How was it?" prompt (`log-sheet`); associate them via `aria-labelledby`.

**Layout**
- **Bean-detail spec grid leaves a large empty band** when item count isn't a multiple of the column count (7 items in a 5-up auto-fit grid → a wide gap-colored empty cell). Visible on `d-bean`. Use `auto-fill` + min/max sizing or balance the cell count.
- **Feed wastes desktop width** — a narrow centered single column on 1440px while Discover uses a full 3-up grid. Give the feed a wider max-width or a complementary right rail for visual balance and consistency.
- **Auth pages are top-pinned** (`margin: 60px auto`) leaving a vast empty page below on both viewports; vertically center the card.

**Design-system**
- **"Tag/chip" appears in three different visual forms** across surfaces (flavor chips, brew-method pills, filter chips) with no shared component — unify into one token-driven chip.
- **Nested cards in the feed** — the bean sub-card sits inside the post card (a card-in-card anti-pattern). Flatten the bean reference to a borderless row.
- **"Edit" action uses a settings/gear icon** (`detail.tsx:209` `<Icon name="settings">`) that reads as a sun/asterisk at 17px — semantically wrong; use a pencil/edit glyph.

**Typography**
- **Brand kicker + all micro-labels render in OS monospace** (`SF Mono`/`Menlo` via `.mono`), breaking the Spectral + Hanken system. Reserve mono for numeric data only, or use Hanken small-caps.
- **64 hardcoded fractional px font-sizes** set inline (e.g. `12.5px`, `14.5px`) — no shared scale, and they ignore user rem/zoom. Introduce ~6 `--text-*` rem tokens.
- **Section-heading hierarchy collapses** — many distinct h2s share `fontSize:18` with a large jump to the 30–36 page titles; add an intermediate step.

**Color**
- **Three different reds** for one "destructive" meaning; `--destructive` is shared light/dark and fails AA as dark-mode text. Consolidate.

---

## P3 — Polish

- Non-interactive bean rating exposes a **rounded** value to screen readers (drops "4.6 → 4"); expose the precise value.
- **Two parallel radius scales** coexist (`--r-*` and `--radius-*`); components mix tokens with raw px, so corners drift.
- Rating beans render in **caramel, never the dedicated `--gold` token** — stars look identical to other brown accents.
- Flavor-dot / bean-swatch colors are **fixed sRGB hex that don't theme**; some drop below AA-large in dark mode. The **`.ph` striped placeholder** hardcodes a light-mode oklch so it doesn't invert in dark mode.
- **SCA-score color thresholds diverge** between the bean card and bean detail (same score, different accent color).
- **Brew-params row is conditionally hidden**, giving cards inconsistent internal anatomy in the same feed.
- **9.5px monospace micro-labels** sit below comfortable legibility.
- Card header: **bold body name competes with the larger serif bean name** (two focal points).
- **Motion:** TrendingCards fire `fadeUp` with **zero stagger** (unlike every other list); chips/segmented controls have **no pressed/active motion** (instant color swap only); **only the like "burst"** gives optimistic-feedback motion — save/follow flip silently.
- **Forms:** required fields (Roaster/Coffee name/Origin) have **no visual required marker** (`m-bagform`); brew params accept free text; no `autofocus` or numeric `inputmode` on first fields; **password rule (≥8 chars) is native-`minLength` only**, never shown proactively.
- **Delete has an inline "Delete?" confirm but no undo** — consider an undo toast instead of (or with) the confirm.
- **New-user empty states are sparse** — the default Feed/Journal/Shelf for a fresh account give little guidance toward the first "Add a bag → Log a brew" action.

---

## Cross-cutting themes (fix the cause, not each symptom)

1. **Token discipline.** Define the missing `--berry`, consolidate the 3 reds + `--destructive`, use `--gold` for ratings, and theme the flavor/swatch/placeholder colors. One pass kills ~8 findings.
2. **A type scale.** Replace the 64 inline fractional px sizes with ~6 rem-based `--text-*` tokens and restrict `.mono` to numerics. Kills the typography cluster + the zoom/a11y issue.
3. **Inline-style sprawl → utilities/components.** The heavy inline `style={{…}}` objects are where radius/spacing/color drift originates; migrating the repeated patterns to tokens/components prevents regressions.
4. **Mobile chrome completeness.** The mobile layout is missing Settings + Sign-out and over-uses Discover as a catch-all (Search → Discover). Audit desktop-only affordances for mobile parity.

## What's working (keep it)
- Distinctive, warm **OKLCH design system** with a clean light/dark token split — not a generic AI palette.
- **Bean-detail** (radar chart, SCA score, spec table) and **Discover** (ranked "Trending" + filterable grid) are genuinely strong, information-rich screens.
- **Motion restraint** — ease-out curves, no bounce, and a real `prefers-reduced-motion` block.
- **Accessibility baseline** is better than typical: skip link, focus-visible rings, ARIA on most controls, and (after recent fixes) ≥44px touch targets and ≥16px mobile inputs.
- Honest **optimistic-UI** flows (await-before-success, inline delete confirms).

## Suggested fix order
1. **P1 sidebar footer** + **mobile Settings/Sign-out** (structural, always-on-screen / blocking).
2. **`--berry` + red consolidation** and **hydration/`relativeTime`** fix (token + correctness).
3. **Type-scale + `.mono`** pass and **contrast** fixes (sage, dark-mode reds).
4. P2 layout (feed width, spec grid, nested card, edit icon).
5. P3 polish in batches.

---

### Appendix
- **Screenshots:** `audit-shots/` — `d-*` (desktop) and `m-*` (mobile) for each surface + both sheets.
- **Verification caveat:** 45 of 77 findings hit a transient server rate-limit during auto-verification and were excluded from the verified set; high-severity ones were re-verified by hand (and 3 refuted: mobile "Search" routes to Discover, `error.tsx` copy is adequate, em-dashes are legitimate null-placeholders). The remaining unverified tail is lower-severity and not included.
- **Test data** was seeded for this audit (3 roasters, 6 beans, 8 tastings, follows/likes/comments) under a verified test user.
