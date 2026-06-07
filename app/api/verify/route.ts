import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { consumeVerificationToken } from "@/lib/verification-tokens";

export const dynamic = "force-dynamic";

const db = { query: (t: string, p?: unknown[]) => query(t, p) };

/** Consume a verification token and stamp users.email_verified, then redirect to a
 *  TOKENLESS url (so the token never lingers in history/logs). Neutral outcome on
 *  any failure (no enumeration); redirect target is hardcoded (no open redirect). */
export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");
  const ok = token ? await consumeVerificationToken(db, token) : null;
  if (!ok) return NextResponse.redirect(new URL("/?verified=0", request.url));
  await query(`update users set email_verified = now() where id = $1`, [ok.userId]);
  return NextResponse.redirect(new URL("/?verified=1", request.url));
}
