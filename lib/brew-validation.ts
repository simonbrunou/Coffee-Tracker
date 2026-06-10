import type { AddBagInput, LogBrewInput, TastingAssessment, UpdateBagInput, UpdateBrewInput } from "@/lib/types";
import { ASSESSMENT_AXES } from "@/lib/types";
import { BREW_METHODS } from "@/lib/constants";

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string };
export type Result<T> = Ok<T> | Err;

const SENTINEL = "—";
const num = (s: unknown): number | null => {
  if (typeof s === "number" && Number.isFinite(s)) return s;
  if (typeof s !== "string") return null;
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

export function normalizeDose(v: unknown): string {
  const n = num(v);
  return n != null && n > 0 ? `${n}g` : SENTINEL;
}
export function normalizeRatio(v: unknown): string {
  if (typeof v === "string" && /^1:\d+(\.\d+)?$/.test(v.trim())) return v.trim();
  const n = num(v);
  return n != null && n > 0 ? `1:${n}` : SENTINEL;
}
export function normalizeTemp(v: unknown): string {
  const n = num(v);
  return n != null && n > 0 ? `${n}°C` : SENTINEL;
}

const BREW_ALLOW = BREW_METHODS; // single source of truth — matches the UI brew picker
const str = (v: unknown) => (typeof v === "string" ? v : "");
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function validateBrewFields(r: Record<string, unknown>): Result<Omit<LogBrewInput, "beanId">> {
  const rating = Number(r.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: "Rating must be 1–5." };
  const brewRaw = str(r.brew).trim();
  const brew = BREW_ALLOW.includes(brewRaw) ? brewRaw : "V60";
  const note = str(r.note).slice(0, 1000);
  const assessment = validateTastingAssessment(r.assessment);
  return { ok: true, value: { rating, brew, note, dose: normalizeDose(r.dose), ratio: normalizeRatio(r.ratio), temp: normalizeTemp(r.temp), assessment } };
}

export function validateLogBrew(raw: unknown): Result<LogBrewInput> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const beanId = str(r.beanId).trim();
  if (!beanId) return { ok: false, error: "A bag is required." };
  const f = validateBrewFields(r);
  return f.ok ? { ok: true, value: { beanId, ...f.value } } : f;
}

export function validateUpdateBrew(raw: unknown): Result<UpdateBrewInput> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = str(r.id).trim();
  if (!id) return { ok: false, error: "Missing brew id." };
  const f = validateBrewFields(r);
  return f.ok ? { ok: true, value: { id, ...f.value } } : f;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
function validateBagFields(r: Record<string, unknown>): Result<AddBagInput> {
  const name = str(r.name).trim();
  if (name.length < 1 || name.length > 80) return { ok: false, error: "Coffee name is required." };
  const roasterName = str(r.roasterName).trim();
  if (roasterName.length < 1 || roasterName.length > 80) return { ok: false, error: "Roaster is required." };
  const origin = str(r.origin).trim();
  if (origin.length < 1 || origin.length > 120) return { ok: false, error: "Origin is required." };
  const farm = str(r.farm).trim().slice(0, 120);
  const process = str(r.process).trim().slice(0, 80) || "Washed";
  const roast = str(r.roast).trim() || "Light";
  const color = HEX.test(str(r.color)) ? str(r.color) : "#c98a4a";
  const scaScore = clamp(num(r.scaScore) ?? 86, 80, 100);
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => (x as string).trim()).filter(Boolean) : []);
  const varieties = arr(r.varieties).slice(0, 12);
  const flavors = arr(r.flavors).map((s) => s.slice(0, 40)).slice(0, 10);
  return { ok: true, value: { name, roasterName, origin, farm, varieties, process, roast, scaScore, flavors, color } };
}

export function validateAddBag(raw: unknown): Result<AddBagInput> {
  return validateBagFields((raw ?? {}) as Record<string, unknown>);
}

export function validateUpdateBag(raw: unknown): Result<UpdateBagInput> {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = str(r.id).trim();
  if (!id) return { ok: false, error: "Missing bag id." };
  const f = validateBagFields(r);
  return f.ok ? { ok: true, value: { id, ...f.value } } : f;
}

/** Clamp each of the six intensities to 0–15 or null. Returns null when the
 *  whole assessment is empty (so callers skip writing a row). */
export function validateTastingAssessment(raw: unknown): TastingAssessment | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const out = {} as TastingAssessment;
  let any = false;
  for (const k of ASSESSMENT_AXES) {
    const n = num(r[k]);
    out[k] = n == null ? null : clamp(n, 0, 15);
    if (out[k] != null) any = true;
  }
  return any ? out : null;
}
