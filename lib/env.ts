import { logger } from "@/lib/logger";

// Fail-fast env check. Called ONLY from instrumentation.register() (server start),
// never at module top-level — so `next build` (no DB, dummy secret) stays green.
export function validateEnv(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== "production") return;
  const missing: string[] = [];
  if (!env.AUTH_SECRET) missing.push("AUTH_SECRET");
  if (!env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!env.AUTH_URL) missing.push("AUTH_URL");
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s) in production: ${missing.join(", ")}. See .env.example.`,
    );
  }
  // Email is non-fatal: the dev fallback (log the link) is a valid staging mode, so
  // warn rather than crash if Resend isn't configured.
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    logger.warn("email_not_configured", {
      hint: "RESEND_API_KEY/EMAIL_FROM unset — verification emails will be logged, not sent",
    });
  }
}
