"use client";
/* ============ SCA Flavor Wheel Picker ============ */
import { useState } from "react";
import { Icon } from "./ui";
import { FLAVOR_WHEEL, WHEEL_FLAT } from "@/lib/flavor-wheel";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

export function FlavorWheelPicker({
  value = [],
  onChange,
  max = 10,
}: {
  value?: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  const [openCat, setOpenCat] = useState<string | null>(null);
  const atMax = value.length >= max;
  const toggle = (n: string) => {
    if (value.includes(n)) onChange(value.filter((x) => x !== n));
    else if (value.length < max) onChange([...value, n]);
  };

  return (
    <div>
      {/* selected */}
      {value.length > 0 && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
          {value.map((n) => (
            <span
              key={n}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "5px 8px 5px 11px",
                borderRadius: 99,
                background: "var(--surface-2)",
                border: "1px solid var(--line-soft)",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--coffee)",
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: WHEEL_FLAT[n] || "var(--mocha)" }} />
              {n}
              <button onClick={() => toggle(n)} style={{ display: "inline-flex", color: "var(--mocha)" }}>
                <Icon name="close" size={13} color="var(--mocha)" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* category accordion */}
      <Accordion
        type="single"
        collapsible
        value={openCat ?? ""}
        onValueChange={(v) => setOpenCat(v || null)}
        style={{ display: "flex", flexDirection: "column", gap: 7 }}
      >
        {FLAVOR_WHEEL.map((cat) => {
          const open = openCat === cat.name;
          const countSel = value.filter((v) => cat.groups.some((g) => g.notes.includes(v))).length;
          return (
            <AccordionItem
              key={cat.name}
              value={cat.name}
              className="border-b-0"
              style={{
                border: "1px solid var(--line-soft)",
                borderRadius: "var(--r-md)",
                overflow: "hidden",
                background: open ? "var(--surface)" : "transparent",
              }}
            >
              <AccordionTrigger
                className="py-0 hover:no-underline"
                style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "11px 13px", textAlign: "left" }}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 5,
                    background: cat.color,
                    flexShrink: 0,
                    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)",
                  }}
                />
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--espresso)" }}>{cat.name}</span>
                {countSel > 0 && (
                  <span
                    style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: cat.color, borderRadius: 99, padding: "1px 7px" }}
                  >
                    {countSel}
                  </span>
                )}
                {/* spacer: pushes the built-in chevron to the far right, keeps the label left-aligned */}
                <span style={{ marginLeft: "auto" }} />
              </AccordionTrigger>
              <AccordionContent style={{ padding: "2px 13px 14px" }}>
                {cat.groups.map((g) => (
                  <div key={g.name} style={{ marginTop: 12 }}>
                    {g.notes.length > 1 && (
                      <div
                        className="mono"
                        style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--mocha)", marginBottom: 8 }}
                      >
                        {g.name}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                      {g.notes.map((n) => {
                        const on = value.includes(n);
                        const disabled = !on && atMax;
                        return (
                          <button
                            key={n}
                            onClick={() => toggle(n)}
                            aria-disabled={disabled || undefined}
                            title={disabled ? `Max ${max} notes selected` : undefined}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "6px 11px",
                              borderRadius: 99,
                              fontSize: 12.5,
                              fontWeight: 500,
                              background: on ? cat.color : "var(--surface-2)",
                              color: on ? "#fff" : "var(--coffee)",
                              border: "1px solid " + (on ? cat.color : "var(--line-soft)"),
                              opacity: disabled ? 0.4 : 1,
                              cursor: disabled ? "not-allowed" : "pointer",
                              transition: "all 0.12s",
                            }}
                          >
                            {!on && <span style={{ width: 8, height: 8, borderRadius: "50%", background: cat.color }} />}
                            {n}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
