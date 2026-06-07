import { NextResponse, type NextRequest } from "next/server";
import { generateNonce, buildCsp, staticSecurityHeaders } from "@/lib/security-headers";

// NOTE: this strict nonce CSP requires every route to be DYNAMICALLY rendered (the
// root layout's force-dynamic cascades). If a route ever opts back into static
// rendering (force-static / ISR), Next stops applying per-request nonces and the
// enforced CSP will blank that route — move such a route to a hash-based CSP.
export function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const isDev = process.env.NODE_ENV === "development";
  // Behind Traefik, x-forwarded-proto reflects the public scheme; default to https
  // in prod (TLS-terminated) and http in dev.
  const isHttps = (request.headers.get("x-forwarded-proto") ?? (isDev ? "http" : "https")) === "https";
  // origin (for the report endpoints) is built from the request Host. Behind Traefik
  // the Host is fixed; a forged Host only redirects the attacker's OWN CSP reports, so
  // it's not pinned to an env var (and CR/LF in a Host is rejected upstream).
  const host = request.headers.get("host") ?? "localhost";
  const origin = `${isHttps ? "https" : "http"}://${host}`;
  const opts = { isDev, isHttps, origin };
  const csp = buildCsp(nonce, opts);

  // Next reads the nonce from the REQUEST Content-Security-Policy header and
  // applies it to its own injected scripts — so set it on the forwarded request.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  for (const [k, v] of staticSecurityHeaders(opts)) response.headers.set(k, v);
  return response;
}

export const config = {
  // Run on pages + API for the headers; skip static assets, metadata files, and
  // router PREFETCHes (a prefetch render gets a different nonce than the real nav,
  // which can blank the page — per the official Next CSP matcher).
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
