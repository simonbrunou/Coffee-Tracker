"use client";
/* ============ Cortado — Cards ============ */
import { useEffect, useState } from "react";
import { useData } from "./data-context";
import { useShell } from "./app-provider";
import { Avatar, BeanRating, FlavorChip, Icon, RoastPill, Tag } from "./ui";
import { CommentThread } from "./comment-thread";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Tasting, Bean } from "@/lib/types";
import { relativeTime } from "@/lib/relative-time";

// ---- Tasting card (feed + journal) ----
export function TastingCard({
  tasting,
  onOpenBean,
  onLike,
  liked,
  delay = 0,
}: {
  tasting: Tasting;
  onOpenBean: (id: string) => void;
  onLike: (id: string) => void;
  liked: boolean;
  delay?: number;
}) {
  const D = useData();
  const shell = useShell();
  const isMine = tasting.userId === D.currentUserId;
  const saved = shell.savedTastings.has(tasting.id);
  const [showComments, setShowComments] = useState(false);
  const [burst, setBurst] = useState(false);
  // Author + bean display come denormalized on the row (M3·D) — no global lookup,
  // so the card renders standalone in a paginated feed.

  const doLike = () => {
    if (!liked) {
      setBurst(true);
      setTimeout(() => setBurst(false), 450);
    }
    onLike(tasting.id);
  };

  return (
    <article
      className="fade-up"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line-soft)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
        animationDelay: Math.min(delay, 400) + "ms", // cap stagger so appended pages don't sit invisible
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "14px 16px 12px" }}>
        <button
          type="button"
          onClick={() => shell.openUser(tasting.authorHandle)}
          aria-label={`View ${tasting.authorName}'s profile`}
          style={{ borderRadius: "50%", lineHeight: 0, flexShrink: 0 }}
        >
          <Avatar user={{ name: tasting.authorName, avatar: tasting.authorAvatar }} size={38} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontWeight: 500, fontSize: "var(--text-sm)" }}>{tasting.authorName}</span>
            {isMine && <Tag accent>You</Tag>}
            {!isMine && D.currentUserId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-[length:var(--text-xs)] text-[var(--caramel-deep)]"
                onClick={() => shell.toggleFollowUser(tasting.userId)}
              >
                {shell.followedUsers.has(tasting.userId) ? "Following" : "Follow"}
              </Button>
            )}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--mocha)" }}>
            <button type="button" onClick={() => shell.openUser(tasting.authorHandle)} style={{ color: "inherit", font: "inherit" }}>
              @{tasting.authorHandle}
            </button>
            <RelTime iso={tasting.createdAt} />
          </div>
        </div>
        <BeanRating value={tasting.rating} size={16} />
        {isMine && (
          <BrewMenu onEdit={() => shell.openEditBrew(tasting)} onDelete={() => shell.deleteBrew(tasting.id)} />
        )}
      </div>

      {/* bean reference — flat borderless row (not a nested card) */}
      <button
        onClick={() => onOpenBean(tasting.beanId)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 13,
          width: "100%",
          textAlign: "left",
          padding: "2px 16px 12px",
          background: "transparent",
          borderRadius: 0,
          transition: "opacity 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.72")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      >
        <BeanBag color={tasting.beanColor} size={46} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="display" style={{ fontSize: "var(--text-xl)", fontWeight: 600, lineHeight: 1.15 }}>
            {tasting.beanName}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--mocha)", marginTop: 2 }}>
            {tasting.beanRoasterName ?? "My roaster"} · {tasting.beanOrigin}
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: "var(--text-2xs)", color: "var(--mocha)", alignItems: "center" }}>
          <BrewBadge brew={tasting.brew} />
        </div>
      </button>

      {/* note */}
      <div style={{ padding: "14px 16px 4px" }}>
        <p style={{ fontSize: "var(--text-base)", lineHeight: 1.6, color: "var(--coffee)", textWrap: "pretty" }}>
          {tasting.note}
        </p>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 12 }}>
          {tasting.beanFlavors.map((f) => (
            <FlavorChip key={f} flavor={f} small />
          ))}
        </div>
        {/* brew params — render placeholders when absent so card anatomy stays consistent (no layout jump) */}
        <div style={{ display: "flex", gap: 16, marginTop: 13, fontSize: "var(--text-xs)", color: "var(--mocha)" }}>
          {tasting.brew !== "Espresso" && tasting.dose !== "—" ? (
            <>
              <Param label="Dose" value={tasting.dose} />
              <Param label="Ratio" value={tasting.ratio} />
              <Param label="Temp" value={tasting.temp} />
            </>
          ) : (
            <Param label={tasting.brew} value="—" />
          )}
        </div>
      </div>

      {/* actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px 12px" }}>
        <ActionBtn
          active={liked}
          ariaLabel={liked ? "Unlike" : "Like"}
          onClick={doLike}
          burst={burst}
          icon={
            <Icon
              name="heart"
              size={19}
              fill={liked ? "solid" : "none"}
              color={liked ? "var(--caramel)" : "currentColor"}
            />
          }
          label={tasting.likes + (liked && !tasting.likedByMe ? 1 : !liked && tasting.likedByMe ? -1 : 0)}
          activeColor="var(--caramel)"
        />
        <ActionBtn
          icon={<Icon name="comment" size={19} />}
          label={tasting.commentsCount}
          ariaLabel="Comments"
          onClick={() => setShowComments((s) => !s)}
        />
        <div style={{ flex: 1 }} />
        <ActionBtn
          active={saved}
          onClick={() => shell.toggleSaveTasting(tasting.id)}
          icon={
            <Icon
              name="bookmark"
              size={19}
              fill={saved ? "solid" : "none"}
              color={saved ? "var(--sage-deep)" : "currentColor"}
            />
          }
          label={saved ? "Saved" : "Save"}
          activeColor="var(--sage-deep)"
        />
      </div>
      {showComments && <CommentThread tastingId={tasting.id} />}
    </article>
  );
}

// Relative "time ago" label. SSR and the first client render are non-deterministic
// for a wall-clock value (server and client compute `Date.now()` at different instants),
// which trips React's hydration check. So we render an empty, stable placeholder on the
// first paint — identical on server and client — then fill in the live value in a mount
// effect. `suppressHydrationWarning` covers the brief swap. relative-time.ts stays pure.
function RelTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    setLabel(relativeTime(iso));
  }, [iso]);
  // Separator lives inside so the header reads cleanly before the value resolves
  // (no dangling middot on first paint).
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {label ? ` · ${label}` : ""}
    </time>
  );
}

// Own-brew overflow menu: Edit opens the sheet in edit mode; Delete confirms inline.
function BrewMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (confirm) {
    return (
      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--mocha)" }}>Delete?</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { onDelete(); setConfirm(false); setOpen(false); }}
          style={{ color: "var(--berry)" }}
        >
          Yes
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>No</Button>
      </span>
    );
  }
  return open ? (
    <span style={{ display: "inline-flex", gap: 2, alignItems: "center" }}>
      <Button variant="ghost" size="sm" onClick={() => { onEdit(); setOpen(false); }}>Edit</Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>Delete</Button>
      <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setOpen(false)}>
        <Icon name="close" size={16} />
      </Button>
    </span>
  ) : (
    <Button variant="ghost" size="icon" aria-label="Brew options" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(true)}>
      <Icon name="edit" size={16} />
    </Button>
  );
}

function Param({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
      <span
        className="mono"
        style={{ fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.75 }}
      >
        {label}
      </span>
      <span style={{ fontWeight: 600, color: "var(--coffee)", fontSize: "var(--text-xs)" }}>{value}</span>
    </span>
  );
}

export function BrewBadge({ brew }: { brew: string }) {
  return (
    <Badge
      variant="outline"
      className="gap-1.5 px-2.5 py-1 text-[length:var(--text-2xs)] font-semibold"
      style={{ background: "var(--surface)", borderColor: "var(--line)", color: "var(--coffee)" }}
    >
      <Icon name="drop" size={13} color="var(--caramel)" /> {brew}
    </Badge>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  active,
  activeColor,
  burst,
  ariaLabel,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  activeColor?: string;
  burst?: boolean;
  ariaLabel?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className="relative gap-[7px] px-[11px] text-[length:var(--text-sm)] font-semibold"
      style={{ color: active ? activeColor : "var(--mocha)" }}
    >
      <span style={{ display: "inline-flex", animation: burst ? "pop 0.45s ease" : "none" }}>{icon}</span>
      {label}
    </Button>
  );
}

// ---- Bean "bag" glyph (stylized coffee bag) ----
export function BeanBag({ color, size = 46 }: { color: string; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size * 1.18,
        borderRadius: "6px 6px 8px 8px",
        flexShrink: 0,
        background: `linear-gradient(160deg, ${color}, color-mix(in oklch, ${color} 72%, #000))`,
        position: "relative",
        boxShadow: "var(--shadow-sm)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "22%",
          background: "rgba(0,0,0,0.18)",
          borderBottom: "1px solid rgba(255,255,255,0.12)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "34%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "52%",
          height: "52%",
          borderRadius: "50%",
          border: "2px solid rgba(255,255,255,0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ width: "34%", height: "34%", borderRadius: "50%", background: "rgba(255,255,255,0.4)" }} />
      </div>
    </div>
  );
}

// ---- Bean card (discover grid) ----
export function BeanCard({
  bean,
  onOpen,
  delay = 0,
}: {
  bean: Bean;
  onOpen: (id: string) => void;
  delay?: number;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      className="fade-up"
      onClick={() => onOpen(bean.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        textAlign: "left",
        background: "var(--surface)",
        border: "1px solid var(--line-soft)",
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
        boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-sm)",
        transform: hover ? "translateY(-3px)" : "none",
        transition: "transform 0.2s, box-shadow 0.2s",
        animationDelay: delay + "ms",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "20px 18px 16px",
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
          background: `linear-gradient(180deg, color-mix(in oklch, ${bean.color} 12%, var(--surface)), var(--surface))`,
        }}
      >
        <BeanBag color={bean.color} size={52} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <Tag>{bean.process}</Tag>
            <RoastPill roast={bean.roast} />
          </div>
          <div className="display" style={{ fontSize: "var(--text-xl)", fontWeight: 600, lineHeight: 1.1 }}>
            {bean.name}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--mocha)", marginTop: 3 }}>{bean.origin}</div>
        </div>
      </div>
      <div style={{ padding: "0 18px 16px", flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {bean.flavors.map((f) => (
            <FlavorChip key={f} flavor={f} small />
          ))}
        </div>
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 13,
            borderTop: "1px solid var(--line-soft)",
          }}
        >
          {bean.ratings > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <BeanRating value={Math.round(bean.avgRating)} size={14} />
              <span style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>{bean.avgRating}</span>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--mocha)" }}>({bean.ratings})</span>
            </div>
          ) : bean.scaScore ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--text-xs)", color: "var(--mocha)" }}>
              <span className="mono" style={{ fontSize: "var(--text-2xs)", letterSpacing: "0.05em" }}>
                SCA
              </span>
              <span style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--caramel-deep)" }}>{bean.scaScore}</span>
            </span>
          ) : (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--mocha)" }}>New bag</span>
          )}
          {bean.price ? (
            <span style={{ fontWeight: 700, fontSize: "var(--text-base)", color: "var(--caramel-deep)" }}>${bean.price}</span>
          ) : bean.owned ? (
            <span style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--sage-deep)" }}>On shelf</span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
