import "server-only";
import { query } from "@/lib/db";
import { createVerificationToken } from "@/lib/verification-tokens";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

const db = { query: (t: string, p?: unknown[]) => query(t, p) };

/** Self-contained: looks up the user's email + verified status, no-ops if already
 *  verified, else mints a token and emails the verification link. Never throws on a
 *  send failure (the user can resend) — logs instead. */
export async function sendVerificationEmail(userId: string): Promise<void> {
  const { rows } = await query<{ email: string | null; email_verified: Date | null }>(
    `select email, email_verified from users where id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row?.email || row.email_verified) return;
  try {
    const raw = await createVerificationToken(db, userId, row.email);
    // AUTH_URL is unset in local dev (trustHost) — fall back so the dev link is clickable.
    const base = (process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
    const url = `${base}/api/verify?token=${raw}`;
    // Log the RAW token URL ONLY on the dev-fallback path (no Resend key). In prod the
    // single-use token must never hit the logs — log a tokenless event instead.
    if (!process.env.RESEND_API_KEY) logger.info("verify_link", { userId, url });
    else logger.info("verify_email_sent", { userId });
    await sendEmail(
      row.email,
      "Verify your Cortado email",
      `<p>Confirm your email to start logging brews.</p><p><a href="${url}">Verify my email</a></p><p>This link expires in 24 hours.</p>`,
    );
  } catch (err) {
    logger.error("verify_email_failed", { userId, err: String(err) });
  }
}
