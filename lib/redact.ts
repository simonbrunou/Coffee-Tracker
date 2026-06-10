/** Mask an email address for logs: keep the first local-part character and the
 *  full domain (enough to debug), drop the rest. A value with no "@" is dropped
 *  wholesale rather than risk leaking an unexpected identifier. */
export function redactEmail(value: string): string {
  const at = value.indexOf("@");
  if (at < 0) return "<redacted>";
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const head = local.length > 1 ? `${local[0]}***` : "***";
  return `${head}@${domain}`;
}

/** Redact the identifier embedded in a rate-limit key so a logged store error
 *  can't leak PII: `:email:<addr>` is masked via redactEmail, and `:ip:<addr>`
 *  / `:user:<id>` tails are dropped to `<redacted>`. The action prefix
 *  (`login`, `signup`, `csp`, `verify`) is kept for debuggability. */
export function redactKey(key: string): string {
  return key
    .replace(/(:email:)(.+)$/, (_m, prefix: string, addr: string) => prefix + redactEmail(addr))
    .replace(/(:(?:ip|user):).+$/, "$1<redacted>");
}
