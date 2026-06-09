"use client";
/* ============ Cortado — Shared bottom-sheet chrome ============ */
import { Icon } from "./ui";
import { Button } from "@/components/ui/button";

export function SheetHeader({
  kicker,
  onClose,
  onBack,
}: {
  kicker: string;
  onClose: () => void;
  onBack?: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "18px 20px 14px",
        borderBottom: "1px solid var(--line-soft)",
      }}
    >
      <div style={{ width: 40 }}>
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
            <Icon name="back" size={20} />
          </Button>
        )}
      </div>
      <div className="mono" style={{ fontSize: "var(--text-2xs)", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--caramel-deep)" }}>
        {kicker}
      </div>
      <div style={{ width: 40, textAlign: "right" }}>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="ml-auto">
          <Icon name="close" size={20} />
        </Button>
      </div>
    </div>
  );
}

export function DonePanel({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ padding: "64px 30px", textAlign: "center", animation: "fadeIn 0.3s" }}>
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          background: "var(--caramel-soft)",
          margin: "0 auto 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "pop 0.5s ease",
        }}
      >
        <Icon name="check" size={36} color="var(--caramel-deep)" />
      </div>
      <h2 className="display" style={{ fontSize: "var(--text-3xl)", fontWeight: 700 }}>
        {title}
      </h2>
      <p style={{ color: "var(--mocha)", marginTop: 8, fontSize: "var(--text-md)" }}>{sub}</p>
    </div>
  );
}
