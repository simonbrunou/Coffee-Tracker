import { describe, it, expect } from "vitest";
import {
  validateLogBrew, validateAddBag, normalizeDose, normalizeRatio, normalizeTemp,
} from "@/lib/brew-validation";

describe("normalize brew params", () => {
  it("formats numbers and passes formatted strings through", () => {
    expect(normalizeDose("15")).toBe("15g");
    expect(normalizeDose("15g")).toBe("15g");
    expect(normalizeRatio("16")).toBe("1:16");
    expect(normalizeRatio("1:16")).toBe("1:16");
    expect(normalizeTemp("94")).toBe("94°C");
  });
  it("rejects garbage to the sentinel", () => {
    expect(normalizeDose("abc")).toBe("—");
    expect(normalizeDose("—")).toBe("—");
    expect(normalizeTemp("")).toBe("—");
  });
});

describe("validateLogBrew", () => {
  const ok = { beanId: "b-1", rating: 4, brew: "V60", note: "nice", dose: "15g", ratio: "1:16", temp: "94°C" };
  it("accepts a valid brew", () => {
    const r = validateLogBrew(ok);
    expect(r.ok).toBe(true);
  });
  it("requires a beanId", () => {
    expect(validateLogBrew({ ...ok, beanId: "" }).ok).toBe(false);
  });
  it("rejects out-of-range rating", () => {
    expect(validateLogBrew({ ...ok, rating: 9 }).ok).toBe(false);
    expect(validateLogBrew({ ...ok, rating: 0 }).ok).toBe(false);
  });
  it("caps the note length", () => {
    const r = validateLogBrew({ ...ok, note: "x".repeat(5000) });
    if (r.ok) expect(r.value.note.length).toBeLessThanOrEqual(1000);
    else throw new Error("should pass with truncation");
  });
  // Regression: the allowlist must match the UI's BREW_METHODS exactly, or the
  // picker's "Moka Pot"/"Kalita" silently coerce to "V60" (caught by the spike).
  it("preserves full canonical method names (Moka Pot, Kalita)", () => {
    for (const m of ["Moka Pot", "Kalita", "French Press"]) {
      const r = validateLogBrew({ ...ok, brew: m });
      if (r.ok) expect(r.value.brew).toBe(m);
      else throw new Error(`${m} should be a valid brew method`);
    }
  });
});

describe("validateAddBag", () => {
  const ok = {
    name: "Idido", roasterName: "Ember & Oak", origin: "Gedeb", farm: "Idido",
    varieties: ["Heirloom"], process: "Washed", roast: "Light", scaScore: 88,
    flavors: ["Jasmine"], color: "#b07a3c",
  };
  it("accepts a valid bag", () => expect(validateAddBag(ok).ok).toBe(true));
  it("requires a name and roaster and origin", () => {
    expect(validateAddBag({ ...ok, name: "  " }).ok).toBe(false);
    expect(validateAddBag({ ...ok, roasterName: "" }).ok).toBe(false);
    expect(validateAddBag({ ...ok, origin: "" }).ok).toBe(false);
  });
  it("clamps scaScore into [80,100]", () => {
    const r = validateAddBag({ ...ok, scaScore: 999 });
    if (r.ok) expect(r.value.scaScore).toBe(100); else throw new Error("should clamp");
  });
  it("caps flavors at 10", () => {
    const r = validateAddBag({ ...ok, flavors: Array.from({ length: 20 }, (_, i) => `f${i}`) });
    if (r.ok) expect(r.value.flavors.length).toBe(10); else throw new Error("should cap");
  });
});
