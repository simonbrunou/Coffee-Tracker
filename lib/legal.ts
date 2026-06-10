import "server-only";

// Legal facts read at REQUEST time (the (legal) pages are force-dynamic). Env
// overrides everything (set per-deploy; see .env.example).
//
// Two tiers:
//  - OPERATOR/IDENTITY facts only the deployer knows (entity, contact, jurisdiction,
//    hosting/db region, log retention) have NO default — unset renders an honest
//    "[to be configured]" marker rather than a fabricated legal fact.
//  - GDPR-FIRST POLICY statements that describe THIS APP's design (min age, legal
//    bases, transfers, liability, DB TLS, how DSARs are handled) ship accurate
//    defaults, so the pages are substantively complete out of the box. Confirm the
//    wording with counsel; override via env if your deployment differs.
const FALLBACK = "[to be configured]";
const v = (key: string, fallback: string = FALLBACK): string => process.env[key]?.trim() || fallback;

export const legal = {
  // Operator/identity — must be set per-deploy (no default).
  entity: () => v("LEGAL_ENTITY"),
  contact: () => v("LEGAL_CONTACT"),
  jurisdiction: () => v("LEGAL_JURISDICTION"),
  hosting: () => v("LEGAL_HOSTING"),
  dbHost: () => v("LEGAL_DB_HOST"),
  logRetention: () => v("LEGAL_LOG_RETENTION"),
  // GDPR-first policy defaults (accurate for this app; env-overridable).
  dsarProcess: () =>
    v("LEGAL_DSAR_PROCESS", "the in-app export (Settings → Your data) and a request to the contact above"),
  minAge: () => v("LEGAL_MIN_AGE", "16"),
  dataTransfer: () =>
    v(
      "LEGAL_DATA_TRANSFER",
      "We host your data within the EU/EEA. Where a processor operates outside the EEA, transfers are protected by the European Commission's Standard Contractual Clauses or an adequacy decision.",
    ),
  liability: () =>
    v(
      "LEGAL_LIABILITY",
      "The service is provided 'as is' without warranties of any kind. To the fullest extent permitted by law we are not liable for indirect or consequential loss; nothing here limits liability that cannot be limited under applicable law.",
    ),
  legalBases: () =>
    v(
      "LEGAL_LEGAL_BASES",
      "We process your account and content to perform our agreement with you (Art. 6(1)(b) GDPR), and we rate-limit and secure the service under our legitimate interests (Art. 6(1)(f) GDPR).",
    ),
  // Derived from the REAL DB-transport config so the page never over-claims: TLS is
  // opt-in via DATABASE_SSL (off by default — the documented Coolify deploy reaches
  // Postgres over a private Docker network, not the public internet). LEGAL_DB_TLS
  // overrides if your posture differs.
  dbTls: () => {
    const override = process.env.LEGAL_DB_TLS?.trim();
    if (override) return override;
    const ssl = process.env.DATABASE_SSL?.trim();
    return ssl === "require" || ssl === "no-verify"
      ? "Connections between the application and our database are encrypted with TLS."
      : "Our database is not exposed to the public internet; it is reached only over the host's private network. We enable TLS for database connections that cross a public network.";
  },
};
