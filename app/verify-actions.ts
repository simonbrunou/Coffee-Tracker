"use server";
import { requireUserId } from "@/lib/auth";
import { throttle } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/verify-email";

const RESEND_LIMIT = 5; // per 15-min window per user

/** Re-send the current user's verification email. Keyed to the logged-in user
 *  (no email/IP enumeration surface) and per-user rate-limited. Always returns void
 *  (neutral). The recipient is resolved server-side from the caller's own row, so
 *  the worst case (if the fail-open limiter lifts under DB stress) is a user flooding
 *  their OWN inbox + Resend quota — never a victim-targeted bomb. */
export async function resendVerification(): Promise<void> {
  const userId = await requireUserId();
  if (!(await throttle(`verify:user:${userId}`, RESEND_LIMIT))) return;
  await sendVerificationEmail(userId);
}
