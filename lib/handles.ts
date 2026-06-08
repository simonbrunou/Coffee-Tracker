import { randomBytes } from "node:crypto";

/** Non-PII, collision-proof handle: `user_` + 10 base36 chars (~52 bits). */
export function generateHandle(): string {
  let s = "";
  while (s.length < 10) {
    s += randomBytes(8).readUInt32BE(0).toString(36);
  }
  return "user_" + s.slice(0, 10);
}

/** Handles that would shadow a current/future route segment under /u or the app. */
export const RESERVED_HANDLES = new Set([
  "u", "api", "settings", "login", "signup", "discover", "journal", "profile", "bean", "roaster", "feed",
]);

/** 3–30 chars, lowercase letters/digits/underscore, not a reserved route word. */
export function isValidHandle(handle: string): boolean {
  return /^[a-z0-9_]{3,30}$/.test(handle) && !RESERVED_HANDLES.has(handle);
}
