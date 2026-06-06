// Minimal structured logger: one JSON line per call to stdout/stderr.
// This is the Sentry-ready seam — when Sentry lands, forward error()/warn() here.
type Ctx = Record<string, unknown>;

function emit(level: string, msg: string, ctx?: Ctx) {
  const line = JSON.stringify({ level, msg, ...ctx, ts: new Date().toISOString() });
  if (level === "warn" || level === "error") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, ctx?: Ctx) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: Ctx) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Ctx) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Ctx) => emit("error", msg, ctx),
};
