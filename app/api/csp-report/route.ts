import { logger } from "@/lib/logger";
import { throttle } from "@/lib/rate-limit";
import { clientIp, TRUSTED_PROXY_HOPS } from "@/lib/request-ip";

export const dynamic = "force-dynamic";

// Browsers send CSP reports as one of these content types. Anything else is not a
// real report — reject it so the endpoint can't be used as a generic log-injection
// sink (L4).
const REPORT_TYPES = ["application/csp-report", "application/reports+json"];
const CSP_REPORT_LIMIT = 30; // per 15-min window per IP

/** Receives CSP violation reports (report-uri/report-to). Logs a bounded snippet
 *  via the structured logger so enforced-mode breaks are visible in production.
 *  Gated by content-type + a per-IP rate limit so it can't be turned into an
 *  unauthenticated, unthrottled log-flooding vector (L4). */
export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!REPORT_TYPES.some((t) => contentType.includes(t))) {
    return new Response(null, { status: 415 });
  }
  const ip = clientIp(request.headers.get("x-forwarded-for"), TRUSTED_PROXY_HOPS);
  if (ip !== "unknown" && !(await throttle(`csp:ip:${ip}`, CSP_REPORT_LIMIT))) {
    return new Response(null, { status: 429 });
  }
  try {
    const body = await request.text();
    logger.warn("csp_violation", { report: body.slice(0, 2000) });
  } catch {
    // Malformed/oversized report — ignore; never fail the report endpoint.
  }
  return new Response(null, { status: 204 });
}
