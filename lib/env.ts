// Fail-fast env check. Called ONLY from instrumentation.register() (server start),
// never at module top-level — so `next build` (no DB, dummy secret) stays green.
export function validateEnv(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== "production") return;
  const missing: string[] = [];
  if (!env.AUTH_SECRET) missing.push("AUTH_SECRET");
  if (!env.DATABASE_URL) missing.push("DATABASE_URL");
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s) in production: ${missing.join(", ")}. See .env.example.`,
    );
  }
}
