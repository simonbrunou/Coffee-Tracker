import { FLAVORS } from "@/lib/constants";

const TINTS = Object.values(FLAVORS);

/** Pick a default avatar tint (hex) for a new user. */
export function randomAvatarTint(): string {
  return TINTS[Math.floor(Math.random() * TINTS.length)] ?? "#b07a3c";
}
