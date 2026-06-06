// Next.js instrumentation hooks — auto-discovered at the repo root.
// Keep module top-level BARE (no imports, no env/DB reads): register() runs at
// server START, not during `next build`, so CI's secret-less build stays green.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validateEnv } = await import("@/lib/env");
  validateEnv(process.env);
}

// Next 15's official server-error hook — the Sentry-ready seam.
export async function onRequestError(err: unknown) {
  const { logger } = await import("@/lib/logger");
  // Sentry seam: `Sentry.captureException(err)` slots in right here.
  logger.error("request_error", {
    err: err instanceof Error ? err.message : String(err),
  });
}
