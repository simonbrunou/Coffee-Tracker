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
  const e = err as { name?: string; message?: string; digest?: string; errors?: unknown[] };
  // AggregateError (e.g. a Promise.all of DB queries failing) has an EMPTY top-level
  // `message` — the real causes live in `.errors`. Surface those instead of "".
  const causes = Array.isArray(e?.errors)
    ? e.errors.slice(0, 5).map((x) => (x instanceof Error ? x.message : String(x))).join("; ")
    : "";
  // Bound the line: an AggregateError could carry many/long nested messages.
  const message = (e?.message || causes || String(err)).slice(0, 500);
  logger.error("request_error", { name: e?.name, err: message, digest: e?.digest });
}
