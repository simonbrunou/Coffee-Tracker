"use server";
import { requireUserId } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/verify-email";

const RESEND_LIMIT = 5; // per 15-min window per user

/** Re-send the current user's verification email. Keyed to the logged-in user
 *  (no email/IP enumeration surface). Always returns void (neutral). The send is
 *  gated by a successful token INSERT, so a fail-open limiter can't be used to bomb. */
export async function resendVerification(): Promise<void> {
  const userId = await requireUserId();
  if (!(await checkRateLimit(`verify:user:${userId}`, RESEND_LIMIT))) return;
  await sendVerificationEmail(userId);
}
