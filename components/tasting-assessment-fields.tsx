"use client";
import type { TastingAssessment } from "@/lib/types";

const AXES: { key: keyof TastingAssessment; label: string }[] = [
  { key: "body", label: "Body" },
  { key: "acidity", label: "Acidity" },
  { key: "sweetness", label: "Sweetness" },
  { key: "fruit", label: "Fruit" },
  { key: "floral", label: "Florals" },
  { key: "finish", label: "Finish" },
];

export const EMPTY_ASSESSMENT: TastingAssessment = {
  body: null, acidity: null, sweetness: null, fruit: null, floral: null, finish: null,
};

export function TastingAssessmentFields({
  value,
  onChange,
}: {
  value: TastingAssessment;
  onChange: (next: TastingAssessment) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {AXES.map(({ key, label }) => {
        const v = value[key];
        return (
          <label key={key} style={{ display: "grid", gridTemplateColumns: "84px 1fr 28px", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--espresso)" }}>{label}</span>
            <input
              type="range"
              min={0}
              max={15}
              step={0.5}
              value={v ?? 0}
              onChange={(e) => onChange({ ...value, [key]: Number(e.target.value) })}
              aria-label={`${label} intensity, 0 to 15${v == null ? ", unset" : ""}`}
              style={{ width: "100%", accentColor: "var(--caramel)" }}
            />
            <span className="mono" style={{ fontSize: "var(--text-2xs)", color: "var(--mocha)", textAlign: "right" }}>
              {v == null ? "—" : v}
            </span>
          </label>
        );
      })}
    </div>
  );
}
