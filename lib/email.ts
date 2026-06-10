import "server-only";
import { Resend } from "resend";
import { logger } from "@/lib/logger";
import { redactEmail } from "@/lib/redact";

/** Send an email via Resend. Dev fallback: when RESEND_API_KEY is unset, log the
 *  send instead of calling the SDK, so the verification flow works locally without
 *  Resend credentials. Resend's send returns { data, error } (it does NOT throw) —
 *  we surface a failure as a thrown Error so callers can react. */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    logger.info("email_dev_fallback", { to: redactEmail(to), subject });
    return;
  }
  const { error } = await new Resend(apiKey).emails.send({ from, to, subject, html });
  if (error) {
    logger.error("email_send_error", { to: redactEmail(to), subject, err: error.message });
    throw new Error(`email send failed: ${error.message}`);
  }
}
