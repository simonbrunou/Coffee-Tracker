/* ============ Cortado — Domain Types ============ */
export type { Page } from "@/lib/pagination";

export interface Roaster {
  id: string;
  name: string;
  city: string;
  founded: number;
  beans: number;
  followers: number;
  followedByMe: boolean;
  blurb: string;
}

export interface User {
  id: string;
  name: string;
  handle: string;
  /** Avatar tint (hex). */
  avatar: string;
  tastings: number;
  followers: number;
  following: number;
  followedByMe: boolean;
  bio: string;
}

/**
 * A `Bean` is the rich catalog record — created once. When `owned` is true it
 * also lives on the user's shelf as a "bag" (hence the farm / SCA / remaining
 * fields). User-created bags have a null `roasterId` and carry `roasterName`.
 */
export interface Bean {
  id: string;
  name: string;
  roasterId: string | null;
  roasterName?: string | null;
  origin: string;
  /** Free-form (e.g. "Washed", "Anaerobic natural"). */
  process: string;
  roast: string;
  altitude: string;
  /** Primary variety, kept for back-compat with the seed catalog. */
  varietal: string;
  price: number | null;
  avgRating: number;
  ratings: number;
  /** Bag/label tint (hex). */
  color: string;
  /** SCA tasting notes, by the flavor wheel. */
  flavors: string[];
  desc: string;

  // ---- Bag (catalog) extras ----
  farm?: string;
  varieties?: string[];
  scaScore?: number | null;
  owned?: boolean;
  bagWeight?: string;
  purchased?: string;
  /** Fraction of the bag left, 0–1. */
  remaining?: number | null;
  /** Owner (creator) of this bag; null only for a future shared catalog. */
  ownerId?: string | null;
  wishlistedByMe: boolean;
}

/** A brew/tasting entry — the fast, everyday action logged against a bag. */
export interface Tasting {
  id: string;
  userId: string;
  beanId: string;
  rating: number;
  brew: string;
  dose: string;
  ratio: string;
  temp: string;
  note: string;
  likes: number;
  commentsCount: number;
  /** True when the current viewer has saved/bookmarked this tasting. */
  savedByMe: boolean;
  /** True when the current viewer has liked this tasting (server-derived). */
  likedByMe: boolean;
  /** ISO timestamp the brew was logged; relative label derived on the client. */
  createdAt: string;
  /** Relative age label, e.g. "2h" or "now". */
  time: string;
  // ---- Denormalized for standalone rendering (M3·D): a tasting row carries
  // its author + bean display fields so cards need no global lookup. ----
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  beanName: string;
  beanColor: string;
  beanOrigin: string;
  /** coalesce(roaster.name, bean.roaster_name); null falls back to "My roaster" in the UI. */
  beanRoasterName: string | null;
  beanFlavors: string[];
}

/** A flat comment on a tasting. */
export interface Comment {
  id: string;
  tastingId: string;
  userId: string;
  body: string;
  createdAt: string;
  /** ISO timestamp of the last edit; null if never edited. */
  updatedAt: string | null;
  // Denormalized author (M3·D) so the comment thread needs no global user lookup.
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
}

// ---- SCA Coffee Taster's Flavor Wheel ----
export interface WheelGroup {
  name: string;
  notes: string[];
}
export interface WheelCategory {
  name: string;
  color: string;
  groups: WheelGroup[];
}

export interface AppData {
  roasters: Roaster[];
  users: User[];
  beans: Bean[];
  tastings: Tasting[];
  /** Tastings authored by users the current viewer follows (server-filtered). */
  followingTastings: Tasting[];
  /** First page of the Recent feed (keyset-paginated; M3·D). */
  feed: import("@/lib/pagination").Page<Tasting>;
  /** Current viewer's membership id-lists, to seed the optimistic client Sets. */
  followedUserIds: string[];
  followedRoasterIds: string[];
  savedTastingIds: string[];
  wishedBeanIds: string[];
  currentUserId: string | null;
}

// ---- Server action payloads ----
export interface LogBrewInput {
  beanId: string;
  rating: number;
  brew: string;
  note: string;
  dose: string;
  ratio: string;
  temp: string;
}

export interface AddBagInput {
  name: string;
  roasterName: string;
  origin: string;
  farm: string;
  varieties: string[];
  process: string;
  roast: string;
  scaScore: number;
  flavors: string[];
  color: string;
}

export interface UpdateBrewInput {
  id: string;
  rating: number;
  brew: string;
  note: string;
  dose: string;
  ratio: string;
  temp: string;
}

export interface UpdateBagInput extends AddBagInput {
  id: string;
}

export interface AddCommentInput { tastingId: string; body: string }
export interface UpdateCommentInput { id: string; body: string }
