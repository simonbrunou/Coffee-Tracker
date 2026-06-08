import "server-only";
import { randomBytes } from "node:crypto";

/** Non-PII, collision-proof handle: `user_` + 10 base36 chars (~52 bits).
 *  Server-only (node:crypto) — kept out of lib/handles.ts so the client-safe
 *  validators there don't pull node:crypto into the browser bundle. */
export function generateHandle(): string {
  let s = "";
  while (s.length < 10) {
    s += randomBytes(8).readUInt32BE(0).toString(36);
  }
  return "user_" + s.slice(0, 10);
}
