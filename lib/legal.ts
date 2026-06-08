import "server-only";

// Deployment-specific legal facts, read at REQUEST time (the (legal) pages are
// force-dynamic, so these come from the runtime env — set them per-deploy; see
// .env.example). An unset value renders an honest "[to be configured]" marker —
// never a fabricated legal fact on a legally-operative page.
const FALLBACK = "[to be configured]";
const v = (key: string): string => process.env[key]?.trim() || FALLBACK;

export const legal = {
  entity: () => v("LEGAL_ENTITY"), // operating entity / data-controller legal name
  contact: () => v("LEGAL_CONTACT"), // contact for privacy/legal requests
  jurisdiction: () => v("LEGAL_JURISDICTION"), // governing law & jurisdiction
  hosting: () => v("LEGAL_HOSTING"), // application host provider + region
  dbHost: () => v("LEGAL_DB_HOST"), // database (Postgres) host + region
  logRetention: () => v("LEGAL_LOG_RETENTION"), // server-log retention period
  dsarProcess: () => v("LEGAL_DSAR_PROCESS"), // how data-access/export requests are handled
  minAge: () => v("LEGAL_MIN_AGE"), // minimum age to use / children threshold
  dataTransfer: () => v("LEGAL_DATA_TRANSFER"), // cross-border transfer + safeguards
  liability: () => v("LEGAL_LIABILITY"), // disclaimers & limitation of liability
  legalBases: () => v("LEGAL_LEGAL_BASES"), // legal bases / consent model
  dbTls: () => v("LEGAL_DB_TLS"), // database transport-encryption (TLS) posture
};
