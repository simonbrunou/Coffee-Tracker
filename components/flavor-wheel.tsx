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
  const [draft, setDraft] = useState("");
  const addCustom = () => {
    const v = draft.trim().slice(0, 40);
    if (!v || value.includes(v) || value.length >= max) { setDraft(""); return; }
    onChange([...value, v]);
    setDraft("");
  };
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
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                color: "var(--coffee)",
              }}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: WHEEL_FLAT[n] || "var(--mocha)",
                  boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--espresso) 22%, transparent)",
                }}
              />
              {n}
              <button onClick={() => toggle(n)} aria-label={`Remove ${n}`} style={{ display: "inline-flex", color: "var(--mocha)" }}>
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
                  aria-hidden="true"
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 5,
                    background: cat.color,
                    flexShrink: 0,
                    boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--espresso) 18%, transparent)",
                  }}
                />
                <span style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--espresso)" }}>{cat.name}</span>
                {countSel > 0 && (
                  <span
                    style={{
                      fontSize: "var(--text-2xs)",
                      fontWeight: 700,
                      color: "#fff",
                      background: cat.color,
                      borderRadius: 99,
                      padding: "1px 7px",
                      boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--espresso) 18%, transparent)",
                    }}
                  >
                    {countSel}
                    <span className="sr-only"> selected</span>
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
                        style={{ fontSize: "var(--text-2xs)", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--mocha)", marginBottom: 8 }}
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
                            aria-pressed={on}
                            disabled={disabled || undefined}
                            title={disabled ? `Max ${max} notes selected` : undefined}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "6px 11px",
                              borderRadius: 99,
                              fontSize: "var(--text-xs)",
                              fontWeight: 500,
                              background: on ? cat.color : "var(--surface-2)",
                              color: on ? "#fff" : "var(--coffee)",
                              border: "1px solid " + (on ? cat.color : "var(--line-soft)"),
                              boxShadow: on ? "inset 0 0 0 1px color-mix(in oklch, var(--espresso) 18%, transparent)" : undefined,
                              opacity: disabled ? 0.4 : 1,
                              cursor: disabled ? "not-allowed" : "pointer",
                              transition: "all 0.12s",
                            }}
                          >
                            {!on && (
                              <span
                                aria-hidden="true"
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: "50%",
                                  background: cat.color,
                                  boxShadow: "inset 0 0 0 1px color-mix(in oklch, var(--espresso) 22%, transparent)",
                                }}
                              />
                            )}
                            {n}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
                    maxLength={40}
                    placeholder="Add your own…"
                    aria-label={`Add a custom ${cat.name} note`}
                    disabled={atMax}
                    style={{
                      flex: 1, minHeight: 40, padding: "8px 12px", borderRadius: 99,
                      border: "1px solid var(--line)", background: "var(--surface)",
                      fontSize: "var(--text-xs)", color: "var(--coffee)",
                    }}
                  />
                  <button
                    onClick={addCustom}
                    disabled={!draft.trim() || atMax}
                    aria-label="Add custom note"
                    style={{
                      minHeight: 40, padding: "0 14px", borderRadius: 99, fontWeight: 600,
                      fontSize: "var(--text-xs)", background: cat.color, color: "#fff",
                      opacity: !draft.trim() || atMax ? 0.4 : 1,
                    }}
                  >
                    Add
                  </button>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
