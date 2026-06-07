const DEFAULT_TRUSTED_HOPS = 1;

/** Client IP from X-Forwarded-For. The reverse proxy appends the real client IP
 *  as the right-most hop, so the left-most entries are attacker-controlled. With
 *  `trustedHops` proxies in front (1 = just Traefik/Coolify; set 2 if a CDN like
 *  Cloudflare is added), the real client IP is the `trustedHops`-th from the right.
 *  Returns "unknown" when XFF is absent or shorter than trustedHops — callers MUST
 *  NOT treat "unknown" as a shared rate-limit bucket (skip the per-IP check). */
export function clientIp(xff: string | null, trustedHops: number = DEFAULT_TRUSTED_HOPS): string {
  if (!xff) return "unknown";
  const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
  const idx = parts.length - trustedHops;
  return idx >= 0 && parts[idx] ? parts[idx] : "unknown";
}

/** Trusted reverse-proxy hop count (1 = Traefik/Coolify only). Override via the
 *  TRUSTED_PROXY_HOPS env var if a CDN/extra proxy is ever added in front. */
export const TRUSTED_PROXY_HOPS = Number(process.env.TRUSTED_PROXY_HOPS ?? 1) || 1;
