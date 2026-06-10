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

/** Redact the email embedded in a rate-limit key (`login:email:<addr>`); any other
 *  key shape (e.g. `login:ip:1.2.3.4`) is returned unchanged. */
export function redactKey(key: string): string {
  return key.replace(/(:email:)(.+)$/, (_m, prefix: string, addr: string) => prefix + redactEmail(addr));
}
