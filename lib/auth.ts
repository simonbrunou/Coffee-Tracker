import "server-only";
// TEMPORARY (Milestone 1): no Auth.js yet, so nobody is authenticated.
// A later task replaces these with real auth() + session_version checks.

export async function getCurrentUserId(): Promise<string | null> {
  return null;
}

export async function requireUserId(): Promise<string> {
  throw new Error("Unauthenticated");
}
