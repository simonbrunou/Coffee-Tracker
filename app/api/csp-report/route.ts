import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Receives CSP violation reports (report-uri/report-to). Logs a bounded snippet
 *  via the structured logger so enforced-mode breaks are visible in production. */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.text();
    logger.warn("csp_violation", { report: body.slice(0, 2000) });
  } catch {
    // Malformed/oversized report — ignore; never fail the report endpoint.
  }
  return new Response(null, { status: 204 });
}
