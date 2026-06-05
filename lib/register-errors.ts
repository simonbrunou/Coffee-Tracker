interface PgError extends Error { code?: string; constraint?: string }

/** Map a DB error to a user message, or rethrow if it is not a unique violation. */
export function mapRegisterError(err: unknown): string {
  const e = err as PgError;
  if (e?.code === "23505") {
    if (e.constraint === "users_email_lower_uq") return "That email is already registered.";
    return "Couldn't pick a username, please try again.";
  }
  throw err;
}
