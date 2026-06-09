"use client";
import type { AssessmentAxis, TastingAssessment } from "@/lib/types";
import { ASSESSMENT_AXES } from "@/lib/types";

const LABELS: Record<AssessmentAxis, string> = {
  body: "Body",
  acidity: "Acidity",
  sweetness: "Sweetness",
  fruit: "Fruit",
  floral: "Florals",
  finish: "Finish",
};

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
      {ASSESSMENT_AXES.map((key) => {
        const label = LABELS[key];
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
            {v == null ? (
              <span className="mono" style={{ fontSize: "var(--text-2xs)", color: "var(--mocha)", textAlign: "right" }}>
                —
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onChange({ ...value, [key]: null })}
                aria-label={`Clear ${label}`}
                title={`Clear ${label}`}
                className="mono"
                style={{
                  fontSize: "var(--text-2xs)",
                  color: "var(--mocha)",
                  textAlign: "right",
                  display: "inline-flex",
                  justifyContent: "flex-end",
                  alignItems: "center",
                  gap: 3,
                  background: "transparent",
                  border: 0,
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                {v}
                <span aria-hidden="true" style={{ fontSize: "var(--text-2xs)", opacity: 0.7 }}>×</span>
              </button>
            )}
          </label>
        );
      })}
    </div>
  );
}
