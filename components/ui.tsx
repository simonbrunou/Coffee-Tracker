"use client";
/* ============ Cortado — Shared UI primitives ============ */
import { useEffect, useState } from "react";
import { flavorColor } from "@/lib/seed-data";
import { cn } from "@/lib/utils";
import { Avatar as AvatarRoot, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { User } from "@/lib/types";
import { relativeTime } from "@/lib/relative-time";

// The cap past which a per-item entrance-stagger stops growing. Capping matters
// for appended "load more" pages: without it a later item's delay (index * step)
// can leave it invisibly waiting for hundreds of ms after it mounts.
const STAGGER_CAP_MS = 400;
/** CSS animation-delay (ms string) for a staggered list item, capped. */
export function staggerMs(delay: number): string {
  return `${Math.min(delay, STAGGER_CAP_MS)}ms`;
}

/** A rounded toggle pill (aria-pressed), hand-rolled six times across the app.
 *  `tone="solid"` is the espresso/surface selector (feed + discover tabs, brew
 *  method); `tone="soft"` is the smaller caramel filter chip (Discover process).
 *  `padding`/`minHeight` cover the minor per-site size differences. */
export function PillButton({
  active,
  onClick,
  children,
  tone = "solid",
  padding,
  minHeight,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "solid" | "soft";
  padding?: string;
  minHeight?: number;
}) {
  const solid = tone === "solid";
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: padding ?? (solid ? "8px 16px" : "6px 13px"),
        minHeight,
        borderRadius: 99,
        fontSize: solid ? "var(--text-sm)" : "var(--text-xs)",
        fontWeight: 600,
        background: active ? (solid ? "var(--espresso)" : "var(--caramel-soft)") : solid ? "var(--surface)" : "transparent",
        color: active ? (solid ? "var(--cream)" : "var(--caramel-deep)") : solid ? "var(--coffee)" : "var(--mocha)",
        border: "1px solid " + (active ? (solid ? "var(--espresso)" : "transparent") : "var(--line)"),
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}

/** Centered "Load more" footer for keyset-paginated lists. Renders nothing when
 *  there's no next page. Replaces six hand-rolled copies whose margins had drifted. */
export function LoadMoreButton({
  hasMore,
  pending,
  onClick,
  marginTop = 18,
}: {
  hasMore: boolean;
  pending: boolean;
  onClick: () => void;
  marginTop?: number;
}) {
  if (!hasMore) return null;
  return (
    <div style={{ display: "flex", justifyContent: "center", marginTop }}>
      <Button variant="outline" onClick={onClick} disabled={pending}>
        {pending ? "Loading…" : "Load more"}
      </Button>
    </div>
  );
}

/** Shared empty / not-found state: a dimmed icon, optional title, a hint, and an
 *  optional CTA. `variant="section"` is the in-page version (feed/journal/search
 *  empties); `variant="page"` is the larger full-route version (bean/roaster not
 *  found). Replaces four near-identical hand-rolled blocks. */
export function EmptyState({
  icon,
  title,
  hint,
  cta,
  variant = "section",
}: {
  icon: IconName;
  title?: string;
  hint: React.ReactNode;
  cta?: { label: string; icon?: IconName; onClick: () => void; variant?: "default" | "outline" };
  variant?: "section" | "page";
}) {
  const page = variant === "page";
  return (
    <div
      className={page ? "fade-up" : undefined}
      style={{
        textAlign: "center",
        color: "var(--mocha)",
        padding: page ? "80px 20px" : "60px 20px",
        ...(page ? { maxWidth: 820, margin: "0 auto" } : null),
      }}
    >
      <div style={{ display: "inline-flex", marginBottom: page ? 16 : 14, opacity: 0.5 }}>
        <Icon name={icon} size={40} />
      </div>
      {title &&
        (page ? (
          <h1 className="display" style={{ fontSize: "var(--text-3xl)", fontWeight: 700 }}>{title}</h1>
        ) : (
          <p style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--coffee)" }}>{title}</p>
        ))}
      <p
        style={{
          fontSize: page ? "var(--text-md)" : "var(--text-base)",
          marginTop: page ? 8 : 6,
          ...(page ? null : { maxWidth: 360, marginInline: "auto" }),
        }}
      >
        {hint}
      </p>
      {cta && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: page ? 22 : 18 }}>
          <Button variant={cta.variant ?? "default"} onClick={cta.onClick}>
            {cta.icon && <Icon name={cta.icon} size={page ? 18 : 17} color="currentColor" />} {cta.label}
          </Button>
        </div>
      )}
    </div>
  );
}

// Hydration-safe relative "time ago". SSR and the first client render compute the
// wall clock at different instants, so render an empty placeholder on first paint
// (identical server + client), then fill the live value in a mount effect.
// suppressHydrationWarning covers the swap. Shared by cards, the journal grid, and
// comment threads so every relative time is hydration-safe.
export function RelTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState("");
  useEffect(() => {
    setLabel(relativeTime(iso));
  }, [iso]);
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {label ? ` · ${label}` : ""}
    </time>
  );
}

// ---- Avatar (initial on tinted circle) — shadcn Avatar with a tinted fallback ----
export function Avatar({ user, size = 40 }: { user: Pick<User, "name" | "avatar">; size?: number }) {
  const initials =
    user.name === "You" ? "You" : user.name.split(" ").map((w) => w[0]).join("").slice(0, 2);
  return (
    <AvatarRoot className="shrink-0" aria-hidden="true" style={{ width: size, height: size }}>
      <AvatarFallback
        style={{
          background: user.avatar,
          color: "#fff",
          fontWeight: 600,
          fontSize: size * (initials.length > 2 ? 0.3 : 0.38),
          letterSpacing: "0.02em",
          boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.18)",
        }}
      >
        {initials}
      </AvatarFallback>
    </AvatarRoot>
  );
}

// ---- Coffee-bean rating (filled beans 0–5) ----
export function BeanRating({
  value,
  size = 16,
  onChange,
  "aria-labelledby": ariaLabelledBy,
  "aria-label": ariaLabel,
}: {
  value: number;
  size?: number;
  onChange?: (n: number) => void;
  "aria-labelledby"?: string;
  "aria-label"?: string;
}) {
  const [hover, setHover] = useState(0);
  const interactive = !!onChange;
  const onKey = (e: React.KeyboardEvent, n: number) => {
    if (!onChange) return;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(Math.min(5, (value || 0) + 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(Math.max(1, (value || 1) - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onChange(n);
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(1);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(5);
    }
  };
  return (
    <div
      role={interactive ? "radiogroup" : "img"}
      aria-labelledby={interactive ? ariaLabelledBy : undefined}
      aria-label={
        interactive
          ? ariaLabelledBy
            ? undefined
            : ariaLabel ?? "Rating"
          : `Rated ${Math.round(value * 10) / 10} of 5`
      }
      style={{ display: "inline-flex", gap: size * 0.18 }}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const active = (hover || value) >= n;
        return (
          <span
            key={n}
            role={interactive ? "radio" : undefined}
            aria-checked={interactive ? value === n : undefined}
            aria-label={interactive ? `${n} bean${n > 1 ? "s" : ""}` : undefined}
            tabIndex={interactive ? (value === n || (value === 0 && n === 1) ? 0 : -1) : undefined}
            onKeyDown={interactive ? (e) => onKey(e, n) : undefined}
            onMouseEnter={interactive ? () => setHover(n) : undefined}
            onMouseLeave={interactive ? () => setHover(0) : undefined}
            onClick={interactive ? () => onChange?.(n) : undefined}
            style={{
              cursor: interactive ? "pointer" : "default",
              lineHeight: 0,
              transition: "transform 0.12s",
              display: "inline-flex",
              borderRadius: 6,
              transform: interactive && hover === n ? "scale(1.2)" : "scale(1)",
            }}
          >
            <BeanGlyph size={size} filled={active} />
          </span>
        );
      })}
    </div>
  );
}

export function BeanGlyph({ size = 16, filled = true }: { size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <ellipse
        cx="12"
        cy="12"
        rx="7"
        ry="10"
        transform="rotate(35 12 12)"
        fill={filled ? "var(--gold)" : "transparent"}
        stroke={filled ? "var(--gold)" : "var(--line)"}
        strokeWidth="1.6"
      />
      <path
        d="M 7 6 Q 12 12 17 18"
        stroke={filled ? "rgba(255,255,255,0.55)" : "var(--line)"}
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---- Flavor chip ----
export function FlavorChip({ flavor, small }: { flavor: string; small?: boolean }) {
  const color = flavorColor(flavor);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: small ? "3px 9px" : "5px 11px",
        borderRadius: 99,
        background: "var(--surface-2)",
        border: "1px solid var(--line-soft)",
        fontSize: small ? "var(--text-2xs)" : "var(--text-xs)",
        fontWeight: 500,
        color: "var(--coffee)",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {flavor}
    </span>
  );
}

// ---- Roast level pill ----
export function RoastPill({ roast }: { roast: string }) {
  const map: Record<string, number> = {
    Light: 0.72,
    "Medium-Light": 0.58,
    Medium: 0.46,
    "Medium-Dark": 0.36,
    Dark: 0.26,
  };
  const l = map[roast] ?? 0.5;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: "var(--text-xs)",
        color: "var(--coffee)",
        fontWeight: 500,
      }}
    >
      <span
        style={{
          width: 11,
          height: 11,
          borderRadius: "50%",
          background: `oklch(${l} 0.06 55)`,
          border: "1px solid var(--line)",
        }}
      />
      {roast}
    </span>
  );
}

// ---- Generic tag/badge — shadcn Badge restyled to the bespoke micro-label ----
export function Tag({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-[6px] px-[9px] py-[4px] text-[length:var(--text-2xs)] font-semibold uppercase leading-none tracking-[0.04em]",
        accent
          ? "border-transparent bg-[var(--caramel-soft)] text-[var(--caramel-deep)]"
          : "border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--mocha)]",
      )}
    >
      {children}
    </Badge>
  );
}

// ---- Icon set (simple line icons) ----
export type IconName =
  | "home" | "journal" | "compass" | "user" | "heart" | "comment" | "bookmark"
  | "plus" | "search" | "close" | "back" | "pin" | "drop" | "check" | "star"
  | "settings" | "edit" | "trend" | "grid" | "sun" | "moon";

export function Icon({
  name,
  size = 20,
  stroke = 1.7,
  fill = "none",
  color = "currentColor",
  ...rest
}: {
  name: IconName;
  size?: number;
  stroke?: number;
  fill?: string;
  color?: string;
} & Omit<React.SVGProps<SVGSVGElement>, "stroke" | "fill" | "color" | "name">) {
  const p = {
    fill: "none",
    stroke: color,
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;
  const paths: Record<IconName, React.ReactNode> = {
    home: (
      <>
        <path {...p} d="M3 10.5 12 3l9 7.5" />
        <path {...p} d="M5 9.5V20h14V9.5" />
      </>
    ),
    journal: (
      <>
        <path {...p} d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z" />
        <path {...p} d="M9 4v16" />
        <path {...p} d="M12 9h3M12 13h3" />
      </>
    ),
    compass: (
      <>
        <circle {...p} cx="12" cy="12" r="9" />
        <path {...p} fill={fill === "solid" ? color : "none"} d="m15.5 8.5-2 5-5 2 2-5z" />
      </>
    ),
    user: (
      <>
        <circle {...p} cx="12" cy="8" r="3.5" />
        <path {...p} d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" />
      </>
    ),
    heart: (
      <path
        fill={fill === "solid" ? color : "none"}
        stroke={color}
        strokeWidth={stroke}
        strokeLinejoin="round"
        d="M12 20s-7-4.4-9.2-8.2C1.2 9 2.3 5.8 5.4 5.2c2-.4 3.6.7 4.6 2 1-1.3 2.6-2.4 4.6-2 3.1.6 4.2 3.8 2.6 6.6C19 15.6 12 20 12 20z"
      />
    ),
    comment: <path {...p} d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 3v-3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />,
    bookmark: (
      <path
        fill={fill === "solid" ? color : "none"}
        stroke={color}
        strokeWidth={stroke}
        strokeLinejoin="round"
        d="M6 4h12v16l-6-4-6 4z"
      />
    ),
    plus: (
      <>
        <path {...p} d="M12 5v14M5 12h14" />
      </>
    ),
    search: (
      <>
        <circle {...p} cx="11" cy="11" r="6.5" />
        <path {...p} d="m20 20-3.5-3.5" />
      </>
    ),
    close: <path {...p} d="M6 6l12 12M18 6 6 18" />,
    back: <path {...p} d="M15 5l-7 7 7 7" />,
    pin: (
      <>
        <path {...p} d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
        <circle {...p} cx="12" cy="10" r="2.5" />
      </>
    ),
    drop: <path {...p} d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
    check: <path {...p} d="M5 12.5 10 17l9-10" />,
    star: (
      <path
        fill={fill === "solid" ? color : "none"}
        stroke={color}
        strokeWidth={stroke}
        strokeLinejoin="round"
        d="m12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6L12 17l-5.3 2.6 1.1-6L3.4 9.4l6-.8z"
      />
    ),
    settings: (
      <>
        <circle {...p} cx="12" cy="12" r="3" />
        <path {...p} d="M12 3v3M12 18v3M5 5l2 2M17 17l2 2M3 12h3M18 12h3M5 19l2-2M17 7l2-2" />
      </>
    ),
    edit: (
      <>
        <path {...p} d="M4 20h4l10-10-4-4L4 16z" />
        <path {...p} d="M14 6l4 4" />
      </>
    ),
    trend: (
      <>
        <path {...p} d="M3 17l5-5 4 3 6-7" />
        <path {...p} d="M17 8h4v4" />
      </>
    ),
    grid: (
      <>
        <rect {...p} x="4" y="4" width="7" height="7" rx="1.5" />
        <rect {...p} x="13" y="4" width="7" height="7" rx="1.5" />
        <rect {...p} x="4" y="13" width="7" height="7" rx="1.5" />
        <rect {...p} x="13" y="13" width="7" height="7" rx="1.5" />
      </>
    ),
    sun: (
      <>
        <circle {...p} cx="12" cy="12" r="4" />
        <path {...p} d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    moon: <path {...p} d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />,
  };
  return (
    <svg
      {...rest}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden={(rest["aria-hidden"] as boolean | undefined) ?? true}
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}

// ---- Image placeholder ----
export function Placeholder({
  label,
  h = 200,
  color,
  radius = 0,
}: {
  label: string;
  h?: number;
  color?: string;
  radius?: number;
}) {
  return (
    <div
      className="ph"
      style={{
        height: h,
        borderRadius: radius,
        position: "relative",
        overflow: "hidden",
        backgroundColor: color ? `color-mix(in oklch, ${color} 14%, var(--surface-2))` : undefined,
      }}
    >
      {color && <div style={{ position: "absolute", inset: 0, background: color, opacity: 0.1 }} />}
      <span style={{ position: "relative", zIndex: 1 }}>{label}</span>
    </div>
  );
}
