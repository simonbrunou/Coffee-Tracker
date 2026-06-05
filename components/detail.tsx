"use client";
/* ============ Cortado — Bean detail, Roaster detail, Profile ============ */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useData } from "./data-context";
import { BeanCard, TastingCard } from "./cards";
import { Avatar, BeanRating, FlavorChip, Icon, Placeholder, Tag } from "./ui";
import { Button } from "@/components/ui/button";
import { flavorColor } from "@/lib/seed-data";
import type { Bean } from "@/lib/types";

// Shown when a /bean/:id or /roaster/:id deep-link points at an id not in the catalog.
function NotFoundPanel({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", textAlign: "center", padding: "80px 20px" }} className="fade-up">
      <div style={{ display: "inline-flex", marginBottom: 16, opacity: 0.5 }}>
        <Icon name="search" size={40} />
      </div>
      <h1 className="display" style={{ fontSize: 26, fontWeight: 700 }}>
        {label} not found
      </h1>
      <p style={{ color: "var(--mocha)", marginTop: 8, fontSize: 15 }}>
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
  onBack,
  onOpenRoaster,
  likes,
  onLike,
  onAdd,
  onEditBag,
  onDeleteBag,
}: {
  beanId: string;
  onBack: () => void;
  onOpenRoaster: (id: string) => void;
  likes: Set<string>;
  onLike: (id: string) => void;
  onAdd: (id: string) => void;
  onEditBag?: (beanId: string) => void;
  onDeleteBag?: (beanId: string) => void;
}) {
  const D = useData();
  const bean = D.bean(beanId);
  const [following, setFollowing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!bean) return <NotFoundPanel label="Bean" onBack={onBack} />;
  const isOwner = bean.ownerId != null && bean.ownerId === D.currentUserId;
  const roaster = D.roaster(bean.roasterId);
  const roasterName = roaster?.name ?? bean.roasterName ?? "My roaster";
  const reviews = D.TASTINGS.filter((t) => t.beanId === beanId);
  const varieties = bean.varieties ?? (bean.varietal ? [bean.varietal] : []);
  const scoreColor =
    (bean.scaScore ?? 0) >= 90 ? "var(--sage)" : (bean.scaScore ?? 0) >= 87 ? "var(--caramel-deep)" : "var(--coffee)";

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
            <div className="mono" style={{ fontSize: 10, letterSpacing: "0.1em", opacity: 0.8 }}>
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
          <h1 className="display" style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.02, letterSpacing: "-0.01em" }}>
            {bean.name}
          </h1>
          <button
            onClick={() => roaster?.id && onOpenRoaster(roaster.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 8,
              fontSize: 14.5,
              color: "var(--caramel-deep)",
              fontWeight: 600,
              cursor: roaster?.id ? "pointer" : "default",
            }}
          >
            {roasterName} <span style={{ color: "var(--mocha)", fontWeight: 400 }}>· {bean.origin}</span>
          </button>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--coffee)", marginTop: 14, textWrap: "pretty" }}>
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
                <span className="display" style={{ fontSize: 24, fontWeight: 700, color: scoreColor }}>
                  {bean.scaScore}
                </span>
                <div style={{ lineHeight: 1.1 }}>
                  <div className="mono" style={{ fontSize: 9.5, letterSpacing: "0.08em", color: "var(--mocha)" }}>
                    SCA
                  </div>
                  <div className="mono" style={{ fontSize: 9.5, letterSpacing: "0.08em", color: "var(--mocha)" }}>
                    SCORE
                  </div>
                </div>
              </div>
            ) : null}
            {bean.ratings > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <BeanRating value={Math.round(bean.avgRating)} size={18} />
                <span className="display" style={{ fontSize: 22, fontWeight: 700 }}>
                  {bean.avgRating}
                </span>
                <span style={{ fontSize: 13, color: "var(--mocha)" }}>· {bean.ratings} ratings</span>
              </div>
            )}
            {bean.price ? (
              <span style={{ fontWeight: 700, fontSize: 20, color: "var(--caramel-deep)" }}>${bean.price}</span>
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
                <Icon name="settings" size={17} /> Edit bag
              </Button>
            )}
            {isOwner && onDeleteBag && (
              confirmDelete ? (
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12.5, color: "var(--mocha)" }}>
                    Delete this bag and its {bean.ratings} brew{bean.ratings === 1 ? "" : "s"}?
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => { onDeleteBag(bean.id); setConfirmDelete(false); }}
                    style={{ color: "var(--berry, #a8434a)", borderColor: "var(--berry, #a8434a)" }}
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
                onClick={() => setFollowing((f) => !f)}
                className={following ? "bg-[var(--caramel-soft)]" : undefined}
              >
                <Icon name={following ? "check" : "bookmark"} size={17} /> {following ? "Saved" : "Want to try"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* spec grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: 1,
          background: "var(--line-soft)",
          border: "1px solid var(--line-soft)",
          borderRadius: "var(--r-md)",
          overflow: "hidden",
          marginBottom: 28,
        }}
      >
        <Spec label="Origin" value={bean.origin} />
        <Spec label="Farm / Producer" value={bean.farm || "—"} />
        <Spec label="Variety" value={varieties.join(", ")} />
        <Spec label="Process" value={bean.process} />
        <Spec label="Roast" value={bean.roast} />
        <Spec label="Altitude" value={bean.altitude} />
        <Spec label="SCA Score" value={bean.scaScore ? String(bean.scaScore) : "—"} />
      </div>

      {/* flavor radar + chips */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 24,
          alignItems: "center",
          marginBottom: 30,
          padding: 22,
          background: "var(--surface)",
          border: "1px solid var(--line-soft)",
          borderRadius: "var(--r-lg)",
          boxShadow: "var(--shadow-sm)",
        }}
        className="radar-row"
      >
        <FlavorRadar bean={bean} />
        <div>
          <h3 className="display" style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
            SCA tasting notes
          </h3>
          <p style={{ fontSize: 13.5, color: "var(--mocha)", marginBottom: 14, lineHeight: 1.5 }}>
            {bean.flavors.length ? "The roaster's official cupping notes." : "No notes recorded yet."}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {bean.flavors.map((f) => (
              <FlavorChip key={f} flavor={f} />
            ))}
          </div>
        </div>
      </div>

      {/* reviews */}
      <h2 className="display" style={{ fontSize: 22, fontWeight: 600, marginBottom: 16 }}>
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
            <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--coffee)" }}>
              No brews yet — log your first cup from this bag
            </span>
          </Button>
        ) : (
          <p style={{ fontSize: 14, color: "var(--mocha)" }}>No brews logged yet.</p>
        )
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {reviews.map((t, i) => (
            <TastingCard
              key={t.id}
              tasting={t}
              delay={i * 50}
              onOpenBean={() => {}}
              onLike={onLike}
              liked={likes.has(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "14px 16px", background: "var(--surface)" }}>
      <div
        className="mono"
        style={{ fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--mocha)", marginBottom: 4 }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--espresso)" }}>{value}</div>
    </div>
  );
}

// Radar built from flavor intensities (deterministic from bean)
export function FlavorRadar({ bean }: { bean: Bean }) {
  const axes = ["Body", "Acidity", "Sweetness", "Fruit", "Florals", "Finish"];
  // Seed beans keep their original 'bN' shape; user bags ('b-<uuid>') hash the
  // whole id so each gets a distinct radar (a single index would always be '-').
  const seed =
    bean.id.length <= 2
      ? bean.id.charCodeAt(1)
      : [...bean.id].reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const vals = axes.map((a, i) => {
    let base = 0.5 + 0.4 * Math.sin(seed + i * 1.7);
    if (bean.roast === "Dark" && (a === "Body" || a === "Finish")) base = 0.85;
    if (bean.roast === "Light" && (a === "Acidity" || a === "Florals")) base = 0.82;
    if (bean.process === "Natural" && a === "Fruit") base = 0.9;
    return Math.max(0.3, Math.min(0.95, base));
  });
  const size = 150,
    c = size / 2,
    r = c - 22;
  const pt = (i: number, m: number): [number, number] => {
    const ang = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
    return [c + Math.cos(ang) * r * m, c + Math.sin(ang) * r * m];
  };
  const poly = vals.map((v, i) => pt(i, v).join(",")).join(" ");
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
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
  onBack,
  onOpenBean,
}: {
  roasterId: string;
  onBack: () => void;
  onOpenBean: (id: string) => void;
}) {
  const D = useData();
  const roaster = D.roaster(roasterId);
  const [following, setFollowing] = useState(false);
  if (!roaster) return <NotFoundPanel label="Roaster" onBack={onBack} />;
  const beans = D.BEANS.filter((b) => b.roasterId === roasterId);
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
              <h1 className="display" style={{ fontSize: 32, fontWeight: 700 }}>
                {roaster.name}
              </h1>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--mocha)", marginTop: 5 }}>
                <Icon name="pin" size={15} color="var(--mocha)" /> {roaster.city} · established {roaster.founded}
              </div>
            </div>
            <Button variant={following ? "outline" : "default"} onClick={() => setFollowing((f) => !f)}>
              <Icon name={following ? "check" : "plus"} size={17} color="currentColor" />{" "}
              {following ? "Following" : "Follow"}
            </Button>
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--coffee)", marginTop: 14, maxWidth: 560, textWrap: "pretty" }}>
            {roaster.blurb}
          </p>
          <div style={{ display: "flex", gap: 24, marginTop: 18 }}>
            <span style={{ fontSize: 14, color: "var(--mocha)" }}>
              <b className="display" style={{ fontSize: 18, color: "var(--espresso)" }}>
                {roaster.beans}
              </b>{" "}
              beans
            </span>
            <span style={{ fontSize: 14, color: "var(--mocha)" }}>
              <b className="display" style={{ fontSize: 18, color: "var(--espresso)" }}>
                {roaster.followers.toLocaleString()}
              </b>{" "}
              followers
            </span>
          </div>
        </div>
      </div>
      <h2 className="display" style={{ fontSize: 20, fontWeight: 600, marginBottom: 14 }}>
        Available beans
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 }}>
        {beans.map((b, i) => (
          <BeanCard key={b.id} bean={b} onOpen={onOpenBean} delay={i * 40} />
        ))}
      </div>
    </div>
  );
}

// ---------- PROFILE ----------
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
  const router = useRouter();
  const me = D.currentUserId ? D.user(D.currentUserId) : undefined;
  const mine = D.currentUserId ? D.TASTINGS.filter((t) => t.userId === D.currentUserId) : [];
  const topFlavors: Record<string, number> = {};
  mine.forEach((t) => {
    const b = D.bean(t.beanId);
    b?.flavors.forEach((f) => (topFlavors[f] = (topFlavors[f] || 0) + 1));
  });
  const flavorList = Object.entries(topFlavors)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  useEffect(() => {
    if (!me) router.replace("/login");
  }, [me, router]);

  if (!me) return null;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 26, flexWrap: "wrap" }}>
        <Avatar user={me} size={84} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 className="display" style={{ fontSize: 30, fontWeight: 700 }}>
            {me.name}
          </h1>
          <div style={{ fontSize: 14, color: "var(--mocha)" }}>@{me.handle}</div>
          <p style={{ fontSize: 14.5, color: "var(--coffee)", marginTop: 8, maxWidth: 440, lineHeight: 1.5 }}>{me.bio}</p>
        </div>
        <Button variant="outline">
          <Icon name="settings" size={17} /> Edit
        </Button>
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
        <ProfStat n={me.tastings} label="Tastings" />
        <ProfStat n={me.followers} label="Followers" />
        <ProfStat n={me.following} label="Following" />
      </div>

      <div style={{ marginBottom: 28 }}>
        <h2 className="display" style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
          Your palate
        </h2>
        <p style={{ fontSize: 13.5, color: "var(--mocha)", marginBottom: 14 }}>The notes you reach for most often.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {flavorList.map(([f, n]) => (
            <span
              key={f}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "7px 13px",
                borderRadius: 99,
                background: "var(--surface)",
                border: "1px solid var(--line-soft)",
                boxShadow: "var(--shadow-sm)",
                fontSize: 13.5,
                fontWeight: 500,
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: flavorColor(f) }} />
              {f}
              <span style={{ color: "var(--mocha)", fontSize: 12 }}>×{n}</span>
            </span>
          ))}
        </div>
      </div>

      <h2 className="display" style={{ fontSize: 18, fontWeight: 600, marginBottom: 14 }}>
        Recent tastings
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {mine.map((t, i) => (
          <TastingCard
            key={t.id}
            tasting={t}
            delay={i * 50}
            onOpenBean={onOpenBean}
            onLike={onLike}
            liked={likes.has(t.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ProfStat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="display" style={{ fontSize: 22, fontWeight: 700 }}>
        {n.toLocaleString()}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--mocha)" }}>{label}</div>
    </div>
  );
}
