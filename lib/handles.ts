import { randomBytes } from "node:crypto";

/** Non-PII, collision-proof handle: `user_` + 10 base36 chars (~52 bits). */
export function generateHandle(): string {
  let s = "";
  while (s.length < 10) {
    s += randomBytes(8).readUInt32BE(0).toString(36);
  }
  return "user_" + s.slice(0, 10);
}

/** 3–30 chars, lowercase letters/digits/underscore. */
export function isValidHandle(handle: string): boolean {
  return /^[a-z0-9_]{3,30}$/.test(handle);
}
