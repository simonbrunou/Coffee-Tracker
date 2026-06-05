import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** A real cost-12 bcrypt hash of a random string, used to equalize timing on the
 *  no-user login path so credential login is not a user-enumeration oracle. */
export const DUMMY_HASH = "$2b$12$iLAk4jyZ9wavgVR1hSV3Ue3.PoV/C9L6JoFAU38peakfy.muTRVGm";
