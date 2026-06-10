// Client-safe handle helpers (no node:crypto) — importable from client components.
// Handle GENERATION lives in lib/generate-handle.ts (server-only, uses node:crypto)
// so importing isValidHandle/RESERVED_HANDLES (e.g. via signup-validation in a
// client component) never drags node:crypto into the browser bundle.

/** Handles that would shadow a current/future route segment under /u or the app. */
export const RESERVED_HANDLES = new Set([
  "u", "api", "settings", "login", "signup", "discover", "journal", "profile", "bean", "roaster", "feed",
]);

/** 3–30 chars, lowercase letters/digits/underscore, not a reserved route word. */
export function isValidHandle(handle: string): boolean {
  return /^[a-z0-9_]{3,30}$/.test(handle) && !RESERVED_HANDLES.has(handle);
}
