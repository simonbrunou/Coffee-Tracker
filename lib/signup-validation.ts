import { isValidHandle } from "@/lib/handles";

export interface SignupInput { name: string; email: string; password: string; handle: string }
export interface CleanSignup { name: string; email: string; password: string; handle: string | null }
export type SignupResult = { ok: true; value: CleanSignup } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PASSWORD_MIN_LENGTH = 8;

/** Password rules shared by signup and the account-linking setPassword flow. */
export function validatePassword(password: string): { ok: true } | { ok: false; error: string } {
  if (password.length < PASSWORD_MIN_LENGTH) return { ok: false, error: "Password must be at least 8 characters." };
  if (new TextEncoder().encode(password).length > 72) return { ok: false, error: "Password is too long." };
  return { ok: true };
}

export function validateSignup(input: SignupInput): SignupResult {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) return { ok: false, error: "Please enter your name." };

  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Please enter a valid email." };

  const pw = validatePassword(input.password);
  if (!pw.ok) return { ok: false, error: pw.error };
  const password = input.password;

  const handleRaw = input.handle.trim();
  const handle = handleRaw === "" ? null : handleRaw.toLowerCase();
  if (handle !== null && !isValidHandle(handle)) {
    return { ok: false, error: "Handle must be 3–30 lowercase letters, digits, or underscores." };
  }

  return { ok: true, value: { name, email, password, handle } };
}
