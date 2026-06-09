import { describe, it, expect } from "vitest";
import { validateTastingAssessment } from "@/lib/brew-validation";

describe("validateTastingAssessment", () => {
  it("returns null when nothing is provided", () => {
    expect(validateTastingAssessment(undefined)).toBeNull();
    expect(validateTastingAssessment(null)).toBeNull();
    expect(validateTastingAssessment({})).toBeNull();
  });

  it("returns null when all six axes are null", () => {
    expect(
      validateTastingAssessment({ body: null, acidity: null, sweetness: null, fruit: null, floral: null, finish: null }),
    ).toBeNull();
  });

  it("clamps each axis to 0–15 and passes nulls through", () => {
    const a = validateTastingAssessment({ body: 20, acidity: -3, sweetness: 7.5, fruit: null, floral: 0, finish: 15 });
    expect(a).toEqual({ body: 15, acidity: 0, sweetness: 7.5, fruit: null, floral: 0, finish: 15 });
  });

  it("treats non-numeric axes as null", () => {
    const a = validateTastingAssessment({ body: "x", acidity: 5 });
    expect(a).toEqual({ body: null, acidity: 5, sweetness: null, fruit: null, floral: null, finish: null });
  });
});
