import "server-only";

/** Whether the GitHub user's PRIMARY email is verified. The bundled GitHub provider
 *  selects the primary email but NOT its verified flag, so we ask /user/emails.
 *  Fail-safe: any error → false (treat as unverified). */
export async function githubEmailVerified(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json", "User-Agent": "cortado" },
    });
    if (!res.ok) return false;
    const emails = (await res.json()) as Array<{ primary?: boolean; verified?: boolean }>;
    return emails.some((e) => e.primary && e.verified === true);
  } catch {
    return false;
  }
}
