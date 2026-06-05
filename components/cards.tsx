"use client";
/* ============ Cortado — Cards ============ */
import { useState } from "react";
import { useData } from "./data-context";
import { useShell } from "./app-provider";
import { Avatar, BeanRating, FlavorChip, Icon, RoastPill, Tag } from "./ui";
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
  const user = D.user(tasting.userId);
  const bean = D.bean(tasting.beanId);
  const [saved, setSaved] = useState(false);
  const [burst, setBurst] = useState(false);

  if (!user || !bean) return null;
  const roaster = D.roaster(bean.roasterId);
  const ago = relativeTime(tasting.createdAt);

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
        animationDelay: delay + "ms",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "14px 16px 12px" }}>
        <Avatar user={user} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ fontWeight: 600, fontSize: 14.5 }}>{user.name}</span>
            {isMine && <Tag accent>You</Tag>}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--mocha)" }}>
            @{user.handle} · {ago}
          </div>
        </div>
        <BeanRating value={tasting.rating} size={16} />
        {isMine && (
          <BrewMenu onEdit={() => shell.openEditBrew(tasting)} onDelete={() => shell.deleteBrew(tasting.id)} />
        )}
      </div>

      {/* bean strip */}
      <button
        onClick={() => onOpenBean(bean.id)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 13,
          width: "100%",
          textAlign: "left",
          padding: "12px 16px",
          margin: "0 0 2px",
          background: "var(--surface-2)",
          borderTop: "1px solid var(--line-soft)",
          borderBottom: "1px solid var(--line-soft)",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--cream-deep)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
      >
        <BeanBag color={bean.color} size={46} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="display" style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.15 }}>
            {bean.name}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--mocha)", marginTop: 2 }}>
            {(roaster ? roaster.name : bean.roasterName) ?? "My roaster"} · {bean.origin}
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: "var(--mocha)", alignItems: "center" }}>
          <BrewBadge brew={tasting.brew} />
        </div>
      </button>

      {/* note */}
      <div style={{ padding: "14px 16px 4px" }}>
        <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--coffee)", textWrap: "pretty" }}>
          {tasting.note}
        </p>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 12 }}>
          {bean.flavors.map((f) => (
            <FlavorChip key={f} flavor={f} small />
          ))}
        </div>
        {/* brew params */}
        {tasting.brew !== "Espresso" && tasting.dose !== "—" && (
          <div style={{ display: "flex", gap: 16, marginTop: 13, fontSize: 12, color: "var(--mocha)" }}>
            <Param label="Dose" value={tasting.dose} />
            <Param label="Ratio" value={tasting.ratio} />
            <Param label="Temp" value={tasting.temp} />
          </div>
        )}
      </div>

      {/* actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 12px 12px" }}>
        <ActionBtn
          active={liked}
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
        <ActionBtn icon={<Icon name="comment" size={19} />} label={tasting.comments} />
        <div style={{ flex: 1 }} />
        <ActionBtn
          active={saved}
          onClick={() => setSaved((s) => !s)}
          icon={
            <Icon
              name="bookmark"
              size={19}
              fill={saved ? "solid" : "none"}
              color={saved ? "var(--sage)" : "currentColor"}
            />
          }
          label={saved ? "Saved" : "Save"}
          activeColor="var(--sage)"
        />
      </div>
    </article>
  );
}

// Own-brew overflow menu: Edit opens the sheet in edit mode; Delete confirms inline.
function BrewMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (confirm) {
    return (
      <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--mocha)" }}>Delete?</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { onDelete(); setConfirm(false); setOpen(false); }}
          style={{ color: "var(--berry, #a8434a)" }}
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
    <Button variant="ghost" size="icon" aria-label="Brew options" onClick={() => setOpen(true)}>
      <Icon name="settings" size={16} />
    </Button>
  );
}

function Param({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
      <span
        className="mono"
        style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.75 }}
      >
        {label}
      </span>
      <span style={{ fontWeight: 600, color: "var(--coffee)", fontSize: 12.5 }}>{value}</span>
    </span>
  );
}

export function BrewBadge({ brew }: { brew: string }) {
  return (
    <Badge
      variant="outline"
      className="gap-1.5 px-2.5 py-1 text-[11.5px] font-semibold"
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
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  activeColor?: string;
  burst?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="relative gap-[7px] px-[11px] text-[13px] font-semibold"
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
          <div className="display" style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.1 }}>
            {bean.name}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--mocha)", marginTop: 3 }}>{bean.origin}</div>
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
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>{bean.avgRating}</span>
              <span style={{ fontSize: 12, color: "var(--mocha)" }}>({bean.ratings})</span>
            </div>
          ) : bean.scaScore ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--mocha)" }}>
              <span className="mono" style={{ fontSize: 10, letterSpacing: "0.05em" }}>
                SCA
              </span>
              <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--caramel-deep)" }}>{bean.scaScore}</span>
            </span>
          ) : (
            <span style={{ fontSize: 12.5, color: "var(--mocha)" }}>New bag</span>
          )}
          {bean.price ? (
            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--caramel-deep)" }}>${bean.price}</span>
          ) : bean.owned ? (
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--sage)" }}>On shelf</span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
