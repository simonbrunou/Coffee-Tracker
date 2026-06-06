import { logger } from "@/lib/logger";

/**
 * Postgres TLS config from the DATABASE_SSL env var. Default OFF — Coolify-internal
 * Postgres shares the Docker network and needs no TLS. We key off this env var, NOT
 * an `sslmode` in the connection string: a URL `sslmode` silently REPLACES the whole
 * `ssl` object, undoing programmatic config. Pick one mechanism — this is it.
 *
 *   unset | "disable" -> no SSL
 *   "require"         -> verified TLS (recommended for an external managed Postgres)
 *   "no-verify"       -> TLS without cert verification (discouraged; MITM risk)
 */
export function resolveSslConfig(env: NodeJS.ProcessEnv): { rejectUnauthorized: boolean } | undefined {
  switch (env.DATABASE_SSL) {
    case "require":
      return { rejectUnauthorized: true };
    case "no-verify":
      logger.warn("database_ssl_no_verify", {
        hint: "TLS certificate verification is DISABLED (MITM risk). Prefer DATABASE_SSL=require with the CA added to the trust store.",
      });
      return { rejectUnauthorized: false };
    default:
      return undefined;
  }
}
