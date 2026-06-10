"use client";
/* ============ Cortado — Bean detail, Roaster detail, Profile ============ */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useData } from "./data-context";
import { useShell } from "@/components/app-provider";
import { useLoadMore } from "./use-load-more";
import { loadMoreBeanReviews, loadMoreRoasterBeans, getMyBeanRadar } from "@/app/actions";
import { BeanCard, TastingCard } from "./cards";
import { Avatar, BeanRating, FlavorChip, Icon, Placeholder, Tag } from "./ui";
import { Button } from "@/components/ui/button";
import { flavorColor } from "@/lib/seed-data";
import { computeTopFlavors } from "@/lib/profile-flavors";
import type { AssessmentAxis, Bean, BeanRadar, Page, Tasting, User } from "@/lib/types";

// Shown when a /bean/:id or /roaster/:id deep-link points at an id not in the catalog.
function NotFoundPanel({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center", padding: "80px 20px" }} className="fade-up">
      <div style={{ display: "inline-flex", marginBottom: 16, opacity: 0.5 }}>
        <Icon name="search" size={40} />
      </div>
      <h1 className="display" style={{ fontSize: "var(--text-3xl)", fontWeight: 700 }}>
        {label} not found
      </h1>
      <p style={{ color: "var(--mocha)", marginTop: 8, fontSize: "var(--text-md)" }}>
        It may have been removed, or the link is out of date.
      </p>
      <div style={{ marginTop: 22 }}>
        <Button variant="outline" onClick={onBack}>
          <Icon name="back" size={18} /> Go back
        </Button>
      </div>
    </div>
  );
}

// ---------- BEAN DETAIL ----------
export function BeanDetail({
  beanId,
  bean,
  initialReviews,
  onBack,
  onOpenRoaster,
  likes,
  onLike,
  onAdd,
  onEditBag,
  onDeleteBag,
}: {
  beanId: string;
  bean: Bean | null;
  initialReviews: Page<Tasting>;
  onBack: () => void;
  onOpenRoaster: (id: string) => void;
  likes: Set<string>;
  onLike: (id: string) => void;
  onAdd: (id: string) => void;
  onEditBag?: (beanId: string) => void;
  onDeleteBag?: (beanId: string) => void;
}) {
  const D = useData();
  const shell = useShell();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { rows: reviews, loadMore, hasMore, pending } = useLoadMore(initialReviews, (c) =>
    loadMoreBeanReviews(beanId, c),
  );
  const [radar, setRadar] = useState<BeanRadar | null>(null);
  const [radarLoading, setRadarLoading] = useState(true);
  // Refetch keyed on the NEWEST review id: logging a brew re-seeds the list
  // (newest first) so reviews[0]?.id changes → refetch; "load more" only appends
  // to the tail, leaving reviews[0]?.id unchanged → no wasted refetch.
  const newestReviewId = reviews[0]?.id;
  useEffect(() => {
    let active = true;
    setRadarLoading(true);
    getMyBeanRadar(beanId)
      .then((r) => { if (active) setRadar(r); })
      .catch(() => {}) // graceful: radar stays at its prior/empty value
      .finally(() => { if (active) setRadarLoading(false); });
    return () => { active = false; };
  }, [beanId, newestReviewId]);
  if (!bean) return <NotFoundPanel label="Bean" onBack={onBack} />;
  const wished = shell.wishedBeans.has(bean.id);
  const isOwner = bean.ownerId != null && bean.ownerId === D.currentUserId;
  const roaster = D.roaster(bean.roasterId);
  const roasterName = roaster?.name ?? bean.roasterName ?? "My roaster";
  const varieties = bean.varieties ?? (bean.varietal ? [bean.varietal] : []);
  // SCA score color: single source of truth shared with the feed card (cards.tsx),
  // which renders the score in a flat caramel accent regardless of value.
  const scoreColor = "var(--caramel-deep)";

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }} className="fade-up">
      <Button variant="outline" onClick={onBack} style={{ marginBottom: 18 }}>
        <Icon name="back" size={18} /> Back
      </Button>

      {/* hero */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 28 }}>
        <div
          style={{
            width: 150,
            height: 178,
            borderRadius: "var(--r-lg)",
            flexShrink: 0,
            background: `linear-gradient(160deg, ${bean.color}, color-mix(in oklch, ${bean.color} 65%, #000))`,
            boxShadow: "var(--shadow-lg)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "20%", background: "rgba(0,0,0,0.2)" }} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              color: "rgba(255,255,255,0.92)",
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                border: "2.5px solid rgba(255,255,255,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(255,255,255,0.5)" }} />
            </div>
            <div className="mono" style={{ fontSize: "var(--text-2xs)", letterSpacing: "0.1em", opacity: 0.8 }}>
              {roasterName.toUpperCase()}
            </div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 10, flexWrap: "wrap" }}>
            <Tag accent>{bean.process}</Tag>
            {varieties.slice(0, 2).map((v) => (
              <Tag key={v}>{v}</Tag>
            ))}
          </div>
          <h1 className="display" style={{ fontSize: "var(--text-5xl)", fontWeight: 700, lineHeight: 1.02, letterSpacing: "-0.01em" }}>
            {bean.name}
          </h1>
          {roaster?.id ? (
            <button
              onClick={() => onOpenRoaster(roaster.id)}
              aria-label={`${roasterName} roaster page`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginTop: 8,
                fontSize: "var(--text-base)",
                color: "var(--caramel-deep)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {roasterName} <span style={{ color: "var(--mocha)", fontWeight: 400 }}>· {bean.origin}</span>
            </button>
          ) : (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: "var(--text-base)", color: "var(--caramel-deep)", fontWeight: 600 }}>
              {roasterName} <span style={{ color: "var(--mocha)", fontWeight: 400 }}>· {bean.origin}</span>
            </div>
          )}
          <p style={{ fontSize: "var(--text-md)", lineHeight: 1.6, color: "var(--coffee)", marginTop: 14, textWrap: "pretty" }}>
            {bean.desc}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 18, flexWrap: "wrap" }}>
            {bean.scaScore ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "7px 14px 7px 12px",
                  borderRadius: 12,
                  background: "var(--surface-2)",
                  border: "1px solid var(--line-soft)",
                }}
              >
                <span className="display" style={{ fontSize: "var(--text-2xl)", fontWeight: 700, color: scoreColor }}>
                  {bean.scaScore}
                </span>
                <div style={{ lineHeight: 1.1 }}>
                  <div className="mono" style={{ fontSize: "var(--text-2xs)", letterSpacing: "0.08em", color: "var(--mocha)" }}>
                    SCA
                  </div>
                  <div className="mono" style={{ fontSize: "var(--text-2xs)", letterSpacing: "0.08em", color: "var(--mocha)" }}>
                    SCORE
                  </div>
                </div>
              </div>
            ) : null}
            {bean.ratings > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <BeanRating value={Math.round(bean.avgRating)} size={18} />
                <span className="display" style={{ fontSize: "var(--text-2xl)", fontWeight: 700 }}>
                  {bean.avgRating}
                </span>
                <span style={{ fontSize: "var(--text-sm)", color: "var(--mocha)" }}>· {bean.ratings} {bean.ratings === 1 ? "rating" : "ratings"}</span>
              </div>
            )}
            {bean.price ? (
              <span style={{ fontWeight: 700, fontSize: "var(--text-2xl)", color: "var(--caramel-deep)" }}>${bean.price}</span>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap", alignItems: "center" }}>
            {isOwner && (
              <Button onClick={() => onAdd(bean.id)}>
                <Icon name="drop" size={18} color="currentColor" /> Log a brew
              </Button>
            )}
            {isOwner && onEditBag && (
              <Button variant="outline" onClick={() => onEditBag(bean.id)}>
                <Icon name="edit" size={17} /> Edit bag
              </Button>
            )}
            {isOwner && onDeleteBag && (
              confirmDelete ? (
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--mocha)" }}>
                    Delete this bag and its {bean.ratings} brew{bean.ratings === 1 ? "" : "s"}?
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => { onDeleteBag(bean.id); setConfirmDelete(false); }}
                    style={{ color: "var(--berry)", borderColor: "var(--berry)" }}
                  >
                    Delete
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                </span>
              ) : (
                <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                  <Icon name="close" size={16} /> Delete
                </Button>
              )
            )}
            {!isOwner && (
              <Button
                variant="outline"
                onClick={() => shell.toggleWishlistBean(bean.id)}
                className={wished ? "bg-[var(--caramel-soft)]" : undefined}
              >
                <Icon name={wished ? "check" : "bookmark"} size={17} /> {wished ? "Saved" : "Want to try"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* spec grid — fixed column count so no dead gap-colored cell trails the
          last row; the final spec spans the columns left in its row to fill it. */}
      {(() => {
        const SPEC_COLS = 4;
        const specs = [
          { label: "Origin", value: bean.origin },
          { label: "Farm / Producer", value: bean.farm || "—" },
          { label: "Variety", value: varieties.join(", ") },
          { label: "Process", value: bean.process },
          { label: "Roast", value: bean.roast },
          { label: "Altitude", value: bean.altitude },
          { label: "SCA Score", value: bean.scaScore ? String(bean.scaScore) : "—" },
        ];
        // Columns occupied by all-but-last in the final row; the last spec spans
        // whatever remains so the row is always full (no empty gap-colored cell).
        const lastSpan = SPEC_COLS - ((specs.length - 1) % SPEC_COLS);
        return (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${SPEC_COLS}, minmax(0, 1fr))`,
              gap: 1,
              background: "var(--line-soft)",
              border: "1px solid var(--line-soft)",
              borderRadius: "var(--r-md)",
              overflow: "hidden",
              marginBottom: 28,
            }}
          >
            {specs.map((s, i, arr) => (
              <Spec key={s.label} label={s.label} value={s.value} span={i === arr.length - 1 ? lastSpan : 1} />
            ))}
          </div>
        );
      })()}

      {/* flavor radar + chips — single wrapper; the radar column only appears once
          the (own-tasting) radar has loaded with data, so the card never flashes
          from two-column to notes-only. */}
      <div
        style={{
          marginBottom: 30, padding: 22, background: "var(--surface)",
          border: "1px solid var(--line-soft)", borderRadius: "var(--r-lg)", boxShadow: "var(--shadow-sm)",
          ...(!radarLoading && radar
            ? { display: "grid", gridTemplateColumns: "auto 1fr", gap: 24, alignItems: "center" }
            : {}),
        }}
        className={!radarLoading && radar ? "radar-row" : undefined}
      >
        {!radarLoading && radar && <FlavorRadar bean={bean} radar={radar} />}
        <NotesBlock bean={bean} />
      </div>

      {/* reviews */}
      <h2 className="display" style={{ fontSize: "var(--text-2xl)", fontWeight: 600, marginBottom: 16 }}>
        {reviews.length} brew{reviews.length !== 1 ? "s" : ""} logged
      </h2>
      {reviews.length === 0 ? (
        isOwner ? (
          <Button
            variant="outline"
            onClick={() => onAdd(bean.id)}
            className="h-auto w-full flex-col gap-2 border-2 border-dashed border-[var(--line)] bg-transparent text-[var(--mocha)]"
            style={{ padding: "28px 20px", borderRadius: "var(--r-lg)" }}
          >
            <Icon name="drop" size={26} color="var(--caramel)" />
            <span style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--coffee)" }}>
              No brews yet — log your first cup from this bag
            </span>
          </Button>
        ) : (
          <p style={{ fontSize: "var(--text-base)", color: "var(--mocha)" }}>No brews logged yet.</p>
        )
      ) : (
        <>
          <div role="list" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {reviews.map((t, i) => (
              <div role="listitem" key={t.id}>
                <TastingCard
                  tasting={t}
                  delay={i * 50}
                  onOpenBean={() => {}}
                  onLike={onLike}
                  liked={likes.has(t.id)}
                />
              </div>
            ))}
          </div>
          {hasMore && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
              <Button variant="outline" onClick={loadMore} disabled={pending}>
                {pending ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Spec({ label, value, span = 1 }: { label: string; value: string; span?: number }) {
  return (
    <div style={{ padding: "14px 16px", background: "var(--surface)", gridColumn: span > 1 ? `span ${span}` : undefined }}>
      <div
        className="mono"
        style={{ fontSize: "var(--text-2xs)", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--mocha)", marginBottom: 4 }}
      >
        {label}
      </div>
      <div style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--espresso)" }}>{value}</div>
    </div>
  );
}

function NotesBlock({ bean }: { bean: Bean }) {
  return (
    <div>
      <h2 className="display" style={{ fontSize: "var(--text-xl)", fontWeight: 600, marginBottom: 4 }}>
        SCA tasting notes
      </h2>
      <p style={{ fontSize: "var(--text-sm)", color: "var(--mocha)", marginBottom: 14, lineHeight: 1.5 }}>
        {bean.flavors.length ? "The roaster's official cupping notes." : "No notes recorded yet."}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {bean.flavors.map((f) => (
          <FlavorChip key={f} flavor={f} />
        ))}
      </div>
    </div>
  );
}

// Radar built from the current user's averaged tasting intensities for this bean
function FlavorRadar({ bean, radar }: { bean: Bean; radar: BeanRadar | null }) {
  const axes = ["Body", "Acidity", "Sweetness", "Fruit", "Florals", "Finish"];
  if (!radar) return null; // caller collapses the card; nothing to draw
  const order: AssessmentAxis[] = ["body", "acidity", "sweetness", "fruit", "floral", "finish"];
  const raw = order.map((k) => radar.values[k]);
  const vals = raw.map((v) => (v == null ? 0 : Math.round((v / 15) * 1000) / 1000));
  const size = 150,
    c = size / 2,
    r = c - 22;
  // Round coordinates so SSR (Node) and the client (browser) emit identical SVG
  // attribute strings. Math.sin/cos are implementation-defined in the last ULP
  // across V8 builds, so unrounded points/cx/cy otherwise differ between server
  // and client render and trigger a React hydration attribute mismatch.
  const round = (n: number) => Math.round(n * 10) / 10;
  const pt = (i: number, m: number): [number, number] => {
    const ang = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
    return [round(c + Math.cos(ang) * r * m), round(c + Math.sin(ang) * r * m)];
  };
  const poly = vals.map((v, i) => pt(i, v).join(",")).join(" ");
  return (
    <svg
      width={size}
      height={size}
      role="img"
      aria-label={`Flavor profile for ${bean.name}: ${axes.map((a, i) => `${a} ${raw[i] == null ? "unset" : Math.round(vals[i] * 10) + " of 10"}`).join(", ")}`}
      style={{ flexShrink: 0 }}
    >
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <polygon
          key={g}
          points={axes.map((_, i) => pt(i, g).join(",")).join(" ")}
          fill="none"
          stroke="var(--line)"
          strokeWidth="1"
        />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--line)" strokeWidth="1" />;
      })}
      <polygon points={poly} fill="color-mix(in oklch, var(--caramel) 22%, transparent)" stroke="var(--caramel)" strokeWidth="2" />
      {vals.map((v, i) => {
        if (raw[i] == null) return null; // unset axis: no data point drawn
        const [x, y] = pt(i, v);
        return <circle key={i} cx={x} cy={y} r="3" fill="var(--caramel)" />;
      })}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 1.22);
        return (
          <text
            key={a}
            x={x}
            y={y}
            fontSize="9.5"
            fill="var(--mocha)"
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ fontFamily: "ui-monospace, monospace", textTransform: "uppercase", letterSpacing: "0.03em" }}
          >
            {a}
          </text>
        );
      })}
    </svg>
  );
}

// ---------- ROASTER DETAIL ----------
export function RoasterDetail({
  roasterId,
  initialBeans,
  onBack,
  onOpenBean,
}: {
  roasterId: string;
  initialBeans: Page<Bean>;
  onBack: () => void;
  onOpenBean: (id: string) => void;
}) {
  const D = useData();
  const shell = useShell();
  const roaster = D.roaster(roasterId);
  const { rows: beans, loadMore, hasMore, pending } = useLoadMore(initialBeans, (c) =>
    loadMoreRoasterBeans(roasterId, c),
  );
  if (!roaster) return <NotFoundPanel label="Roaster" onBack={onBack} />;
  const following = shell.followedRoasters.has(roaster.id);
  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }} className="fade-up">
      <Button variant="outline" onClick={onBack} style={{ marginBottom: 18 }}>
        <Icon name="back" size={18} /> Back
      </Button>
      <div
        style={{
          borderRadius: "var(--r-xl)",
          overflow: "hidden",
          border: "1px solid var(--line-soft)",
          boxShadow: "var(--shadow-md)",
          marginBottom: 24,
        }}
      >
        <Placeholder label="roaster cover photo" h={180} color="var(--caramel)" />
        <div style={{ padding: "22px 26px 26px", background: "var(--surface)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div>
              <h1 className="display" style={{ fontSize: "var(--text-4xl)", fontWeight: 700 }}>
                {roaster.name}
              </h1>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-base)", color: "var(--mocha)", marginTop: 5 }}>
                <Icon name="pin" size={15} color="var(--mocha)" /> {roaster.city} · established {roaster.founded}
              </div>
            </div>
            <Button variant={following ? "outline" : "default"} onClick={() => shell.toggleFollowRoaster(roaster.id)}>
              <Icon name={following ? "check" : "plus"} size={17} color="currentColor" />{" "}
              {following ? "Following" : "Follow"}
            </Button>
          </div>
          <p style={{ fontSize: "var(--text-md)", lineHeight: 1.6, color: "var(--coffee)", marginTop: 14, maxWidth: 560, textWrap: "pretty" }}>
            {roaster.blurb}
          </p>
          <div style={{ display: "flex", gap: 24, marginTop: 18 }}>
            <span style={{ fontSize: "var(--text-base)", color: "var(--mocha)" }}>
              <b className="display" style={{ fontSize: "var(--text-xl)", color: "var(--espresso)" }}>
                {roaster.beans}
              </b>{" "}
              {roaster.beans === 1 ? "bean" : "beans"}
            </span>
            <span style={{ fontSize: "var(--text-base)", color: "var(--mocha)" }}>
              <b className="display" style={{ fontSize: "var(--text-xl)", color: "var(--espresso)" }}>
                {roaster.followers.toLocaleString("en-US")}
              </b>{" "}
              {roaster.followers === 1 ? "follower" : "followers"}
            </span>
          </div>
        </div>
      </div>
      <h2 className="display" style={{ fontSize: "var(--text-xl)", fontWeight: 600, marginBottom: 14 }}>
        Available beans
      </h2>
      {beans.length === 0 ? (
        <p style={{ color: "var(--mocha)", fontSize: "var(--text-base)", padding: "6px 0 4px" }}>
          No beans listed for this roaster yet — check back soon.
        </p>
      ) : (
        <div role="list" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
          {beans.map((b, i) => (
            <div role="listitem" key={b.id}>
              <BeanCard bean={b} onOpen={onOpenBean} delay={i * 40} />
            </div>
          ))}
        </div>
      )}
      {hasMore && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
          <Button variant="outline" onClick={loadMore} disabled={pending}>
            {pending ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------- PROFILE ----------
/** Presentational profile — fed by /profile (own, from context) and /u/[handle]
 *  (public, from server props). No auth redirect lives here (the own route guards
 *  server-side); isOwn picks Edit vs Follow. */
export function ProfileView({
  user,
  initialTastings,
  topFlavors,
  isOwn,
  isFollowing,
  onFollow,
  likes,
  onLike,
  onOpenBean,
  loadMore,
}: {
  user: User;
  initialTastings: Page<Tasting>;
  topFlavors: { flavor: string; n: number }[];
  isOwn: boolean;
  isFollowing: boolean;
  onFollow: () => void;
  likes: Set<string>;
  onLike: (id: string) => void;
  onOpenBean: (id: string) => void;
  loadMore?: (cursor: string | null) => Promise<Page<Tasting>>;
}) {
  const router = useRouter();
  const fetcher = loadMore ?? (async () => ({ rows: [], nextCursor: null }) as Page<Tasting>);
  const { rows: tastings, loadMore: more, hasMore, pending } = useLoadMore<Tasting>(initialTastings, fetcher);
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 26, flexWrap: "wrap" }}>
        <Avatar user={user} size={84} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 className="display" style={{ fontSize: "var(--text-4xl)", fontWeight: 700 }}>
            {user.name}
          </h1>
          <div style={{ fontSize: "var(--text-base)", color: "var(--mocha)" }}>@{user.handle}</div>
          <p style={{ fontSize: "var(--text-base)", color: "var(--coffee)", marginTop: 8, maxWidth: 440, lineHeight: 1.5 }}>{user.bio}</p>
        </div>
        {isOwn ? (
          <Button variant="outline" onClick={() => router.push("/settings")} aria-label="Edit profile">
            <Icon name="edit" size={17} /> Edit profile
          </Button>
        ) : (
          <Button variant={isFollowing ? "outline" : "default"} onClick={onFollow}>
            {isFollowing ? "Following" : "Follow"}
          </Button>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 28,
          padding: "16px 0",
          borderTop: "1px solid var(--line-soft)",
          borderBottom: "1px solid var(--line-soft)",
          marginBottom: 24,
        }}
      >
        <ProfStat n={user.tastings} label="Tastings" />
        <ProfStat n={user.followers} label="Followers" />
        <ProfStat n={user.following} label="Following" />
      </div>

      <div style={{ marginBottom: 28 }}>
        <h2 className="display" style={{ fontSize: "var(--text-xl)", fontWeight: 600, marginBottom: 12 }}>
          {isOwn ? "Your palate" : "Their palate"}
        </h2>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--mocha)", marginBottom: 14 }}>The notes reached for most often.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {topFlavors.map(({ flavor, n }) => (
            <span
              key={flavor}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "7px 13px",
                borderRadius: 99,
                background: "var(--surface)",
                border: "1px solid var(--line-soft)",
                boxShadow: "var(--shadow-sm)",
                fontSize: "var(--text-sm)",
                fontWeight: 500,
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: flavorColor(flavor) }} />
              {flavor}
              <span style={{ color: "var(--mocha)", fontSize: "var(--text-xs)" }}>×{n}</span>
            </span>
          ))}
        </div>
      </div>

      <h2 className="display" style={{ fontSize: "var(--text-xl)", fontWeight: 600, marginBottom: 14 }}>
        Recent tastings
      </h2>
      <div role="list" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {tastings.map((t, i) => (
          <div role="listitem" key={t.id}>
            <TastingCard
              tasting={t}
              delay={i * 50}
              onOpenBean={onOpenBean}
              onLike={onLike}
              liked={likes.has(t.id)}
            />
          </div>
        ))}
      </div>
      {loadMore && hasMore && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
          <Button variant="outline" onClick={more} disabled={pending}>{pending ? "Loading…" : "Load more"}</Button>
        </div>
      )}
    </div>
  );
}

/** Own profile — reads context (preserving optimistic edit/delete) and feeds
 *  ProfileView. The /profile route guards auth server-side, so `me` is present.
 *  NOTE: D.myTastings is capped at 200 (getMyTastings) — intentional/pre-existing;
 *  the public /u path is keyset-paginated. */
export function ProfileScreen({
  onOpenBean,
  likes,
  onLike,
}: {
  onOpenBean: (id: string) => void;
  likes: Set<string>;
  onLike: (id: string) => void;
}) {
  const D = useData();
  const me = D.me;
  if (!me) return null;
  return (
    <ProfileView
      user={me}
      initialTastings={{ rows: D.myTastings, nextCursor: null }}
      topFlavors={computeTopFlavors(D.myTastings)}
      isOwn
      isFollowing={false}
      onFollow={() => {}}
      likes={likes}
      onLike={onLike}
      onOpenBean={onOpenBean}
    />
  );
}

function ProfStat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="display" style={{ fontSize: "var(--text-2xl)", fontWeight: 700 }}>
        {n.toLocaleString("en-US")}
      </div>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--mocha)" }}>{label}</div>
    </div>
  );
}
