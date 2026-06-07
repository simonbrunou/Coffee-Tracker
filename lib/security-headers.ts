export interface HeaderOpts {
  isDev: boolean;
  isHttps: boolean;
  /** Absolute origin (e.g. "https://cortado.example.com"), from the request, for the
   *  report endpoints. Reporting-Endpoints requires an ABSOLUTE URL or browsers ignore
   *  it (which would silently kill the modern report-to channel). */
  origin: string;
}

/** Per-request nonce. base64 of a UUID — satisfies Next's nonce token regex
 *  (^'nonce-([A-Za-z0-9+/_-]+={0,2})'$) so Next tags its own scripts. */
export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

/** Build the CSP string. script-src is nonce + strict-dynamic (no unsafe-inline);
 *  style-src is unsafe-inline (NO nonce — inline style attributes can't carry one,
 *  and a style nonce would cancel unsafe-inline). */
export function buildCsp(nonce: string, opts: HeaderOpts): string {
  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (opts.isDev) scriptSrc.push("'unsafe-eval'"); // React Refresh in dev only
  const directives = [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(" ")}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
    `frame-ancestors 'none'`,
    `report-uri ${opts.origin}/api/csp-report`,
    `report-to csp-endpoint`,
  ];
  if (opts.isHttps) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

/** Static (non-CSP) security headers. HSTS only over HTTPS (never in HTTP dev). */
export function staticSecurityHeaders(opts: HeaderOpts): Array<[string, string]> {
  const headers: Array<[string, string]> = [
    ["X-Frame-Options", "DENY"],
    ["X-Content-Type-Options", "nosniff"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()"],
    ["Reporting-Endpoints", `csp-endpoint="${opts.origin}/api/csp-report"`],
  ];
  if (opts.isHttps) {
    headers.push(["Strict-Transport-Security", "max-age=15552000; includeSubDomains"]);
  }
  return headers;
}
