/* ============ Cortado — Seed / Reference Data ============
   Used to seed Postgres (scripts/db-setup.ts) and as the source of static
   reference maps (flavor colors, brew methods, roast levels) consumed directly
   by the UI. The content tables (roasters, users, beans, tastings, likes) seed
   empty apart from the single current-user row — there is no demo/placeholder
   content; the app starts as a fresh, empty journal. */
import type { Bean, Roaster, Tasting, User } from "./types";
import { WHEEL_FLAT } from "./flavor-wheel";

/** The user whose journal/shelf this app shows. */
export const CURRENT_USER_ID = "u1";

/** Flavor note palette (warm hues) from the original catalog. */
export const FLAVORS: Record<string, string> = {
  Blueberry: "#5b6aa8", "Dark Chocolate": "#5a4233", Caramel: "#b07a3c",
  Hazelnut: "#9c7445", Jasmine: "#c9b86a", "Stone Fruit": "#cf8a5a",
  "Brown Sugar": "#a86a3a", Citrus: "#d6a13e", Cherry: "#a8434a",
  Honey: "#cb9a3e", Floral: "#c07ba0", Molasses: "#4f3a2c",
  Almond: "#b89a6a", "Red Apple": "#b24a44", "Black Tea": "#7a5a44",
  Toffee: "#a06e34", Cocoa: "#6b4a36", Vanilla: "#cabd8a",
  Tropical: "#d99441", Maple: "#9a5f2e", Plum: "#7a4a6a",
};

/** Effective color map: catalog hues, with flavor-wheel leaf colors merged in
 *  so every chip resolves (mirrors flavor-wheel.js's runtime merge). */
export const FLAVOR_COLORS: Record<string, string> = { ...FLAVORS, ...WHEEL_FLAT };

export const flavorColor = (name: string): string => FLAVOR_COLORS[name] ?? "var(--mocha)";

export const ROASTERS: Roaster[] = [];

/** Only the current user is seeded — the account this app's journal belongs to.
 *  Required because tastings.user_id / likes.user_id reference users(id), so the
 *  row must exist before the first logged brew or like. */
export const USERS: User[] = [
  { id: CURRENT_USER_ID, name: "You", handle: "you", avatar: "#b07a3c", tastings: 0, followers: 0, following: 0, bio: "" },
];

export const BEANS: Bean[] = [];

export const PROCESSES = ["Washed", "Natural", "Honey", "Anaerobic", "Wet-Hulled", "Carbonic Maceration"];
export const ROAST_LEVELS = ["Light", "Medium-Light", "Medium", "Medium-Dark", "Dark"];
export const BREW_METHODS = ["V60", "Chemex", "AeroPress", "Espresso", "French Press", "Moka Pot", "Kalita", "Cold Brew"];

/** Tasting entries / reviews — the social + journal feed. Seeds empty; entries
 *  are created by the current user logging brews. */
export const TASTINGS: Tasting[] = [];

/** Tastings the current user has liked at seed time. Seeds empty. */
export const LIKED_SEED: Array<{ userId: string; tastingId: string }> = [];
