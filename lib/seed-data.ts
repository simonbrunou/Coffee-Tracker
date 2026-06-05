/* ============ Cortado — Seed / Reference Data ============
   Mirrors the design prototype's mock data verbatim. Used to seed Postgres
   (scripts/db-setup.ts) and as the source of static reference maps (flavor
   colors, brew methods, roast levels) consumed directly by the UI. */
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

export const ROASTERS: Roaster[] = [
  { id: "r1", name: "Ember & Oak", city: "Portland, OR", founded: 2014, beans: 24, followers: 3120, blurb: "Small-batch roaster obsessed with single-origin transparency and seasonal lots." },
  { id: "r2", name: "Meridian Coffee", city: "Brooklyn, NY", founded: 2011, beans: 41, followers: 8740, blurb: "Bright, modern roasts. We chase clarity and acidity above all." },
  { id: "r3", name: "Slow Loris", city: "Austin, TX", founded: 2018, beans: 16, followers: 1890, blurb: "Comfort-forward roasts for people who like their coffee like a hug." },
  { id: "r4", name: "Northwind Roasting", city: "Seattle, WA", founded: 2009, beans: 33, followers: 5260, blurb: "Classic Pacific Northwest depth with a contemporary palate." },
  { id: "r5", name: "Kestrel Coffee Co.", city: "Denver, CO", founded: 2016, beans: 19, followers: 2410, blurb: "High-altitude roasting for high-altitude living." },
];

export const USERS: User[] = [
  { id: "u1", name: "You", handle: "you", avatar: "#b07a3c", tastings: 47, followers: 128, following: 96, bio: "Chasing the perfect washed Ethiopian. Pour-over devotee." },
  { id: "u2", name: "Mara Vance", handle: "maravance", avatar: "#5a7a5a", tastings: 213, followers: 4200, following: 310, bio: "Q-grader. I taste so you don't have to." },
  { id: "u3", name: "Theo Park", handle: "theobrews", avatar: "#7a5a44", tastings: 88, followers: 940, following: 412, bio: "Home barista. Espresso tinkerer. Dialed in (mostly)." },
  { id: "u4", name: "Lena Ortiz", handle: "lenadrinks", avatar: "#a8434a", tastings: 156, followers: 2700, following: 188, bio: "Filter only. Light roast forever." },
  { id: "u5", name: "Sam Cho", handle: "samcho", avatar: "#5b6aa8", tastings: 64, followers: 520, following: 230, bio: "Weekend roaster, weekday drinker." },
];

export const BEANS: Bean[] = [
  {
    id: "b1", name: "Banko Gotiti", roasterId: "r2", origin: "Yirgacheffe, Ethiopia",
    process: "Washed", roast: "Light", altitude: "1,900–2,100m", varietal: "Heirloom",
    price: 22, avgRating: 4.6, ratings: 184, color: "#c98a4a",
    flavors: ["Blueberry", "Jasmine", "Black Tea"],
    desc: "A crystalline washed Yirgacheffe with a wine-like density and a long floral finish.",
    farm: "Banko Gotiti Washing Station", varieties: ["Heirloom (74158)", "Kurume"], scaScore: 87.5,
    owned: true, bagWeight: "250g", purchased: "Apr 2026", remaining: 0.6,
  },
  {
    id: "b2", name: "La Esperanza", roasterId: "r1", origin: "Huila, Colombia",
    process: "Honey", roast: "Medium-Light", altitude: "1,750m", varietal: "Pink Bourbon",
    price: 24, avgRating: 4.4, ratings: 96, color: "#b07a3c",
    flavors: ["Stone Fruit", "Brown Sugar", "Red Apple"],
    desc: "Pink Bourbon honey lot — syrupy body with orchard fruit sweetness.",
    farm: "Finca La Esperanza · Edwin Noscué", varieties: ["Pink Bourbon"], scaScore: 86.0,
    owned: false, bagWeight: "340g",
  },
  {
    id: "b3", name: "Cerro Azul", roasterId: "r4", origin: "Antigua, Guatemala",
    process: "Washed", roast: "Medium", altitude: "1,600m", varietal: "Bourbon / Caturra",
    price: 19, avgRating: 4.2, ratings: 142, color: "#8a5a36",
    flavors: ["Dark Chocolate", "Toffee", "Almond"],
    desc: "A dependable, cocoa-rich classic. The everyday cup that never lets you down.",
    farm: "Various smallholders, Antigua", varieties: ["Bourbon", "Caturra"], scaScore: 84.5,
    owned: true, bagWeight: "340g", purchased: "May 2026", remaining: 0.3,
  },
  {
    id: "b4", name: "Gachatha AB", roasterId: "r2", origin: "Nyeri, Kenya",
    process: "Washed", roast: "Light", altitude: "1,800m", varietal: "SL28 / SL34",
    price: 26, avgRating: 4.7, ratings: 121, color: "#a8434a",
    flavors: ["Cherry", "Plum", "Citrus"],
    desc: "Blackcurrant intensity and a juicy, mouth-watering acidity. A Kenyan showpiece.",
    farm: "Gachatha Factory · Tetu F.C.S.", varieties: ["SL28", "SL34"], scaScore: 88.0,
    owned: false, bagWeight: "250g",
  },
  {
    id: "b5", name: "Finca Tamana", roasterId: "r5", origin: "Tolima, Colombia",
    process: "Natural", roast: "Medium-Light", altitude: "1,680m", varietal: "Caturra",
    price: 21, avgRating: 4.3, ratings: 78, color: "#9a5f2e",
    flavors: ["Cherry", "Molasses", "Tropical"],
    desc: "A bold natural with jammy fruit and a velvety, sweet finish.",
    farm: "Finca Tamana · Elias Roa", varieties: ["Caturra"], scaScore: 85.5,
    owned: false, bagWeight: "250g",
  },
  {
    id: "b6", name: "Sumatra Lintong", roasterId: "r3", origin: "Lintong, Indonesia",
    process: "Wet-Hulled", roast: "Dark", altitude: "1,400m", varietal: "Typica",
    price: 18, avgRating: 4.0, ratings: 64, color: "#4f3a2c",
    flavors: ["Cocoa", "Molasses", "Maple"],
    desc: "Earthy, full-bodied and low-acid. A cozy dark roast for cold mornings.",
    farm: "Lintong smallholder collective", varieties: ["Typica", "Ateng"], scaScore: 83.0,
    owned: false, bagWeight: "340g",
  },
  {
    id: "b7", name: "Idido", roasterId: "r1", origin: "Gedeb, Ethiopia",
    process: "Natural", roast: "Light", altitude: "2,000m", varietal: "Heirloom",
    price: 25, avgRating: 4.8, ratings: 203, color: "#c07ba0",
    flavors: ["Blueberry", "Floral", "Honey"],
    desc: "The blueberry bomb. A dry-process Ethiopian that tastes like a fruit basket.",
    farm: "Idido Station · Gedeb", varieties: ["Heirloom"], scaScore: 89.0,
    owned: true, bagWeight: "250g", purchased: "May 2026", remaining: 0.85,
  },
  {
    id: "b8", name: "Las Brisas", roasterId: "r4", origin: "Tarrazú, Costa Rica",
    process: "Washed", roast: "Medium", altitude: "1,550m", varietal: "Catuai",
    price: 20, avgRating: 4.1, ratings: 55, color: "#cb9a3e",
    flavors: ["Honey", "Citrus", "Vanilla"],
    desc: "Clean, balanced and gently sweet. A crowd-pleasing daily driver.",
    farm: "Hacienda Las Brisas", varieties: ["Catuai"], scaScore: 84.0,
    owned: false, bagWeight: "340g",
  },
];

export const PROCESSES = ["Washed", "Natural", "Honey", "Anaerobic", "Wet-Hulled", "Carbonic Maceration"];
export const ROAST_LEVELS = ["Light", "Medium-Light", "Medium", "Medium-Dark", "Dark"];
export const BREW_METHODS = ["V60", "Chemex", "AeroPress", "Espresso", "French Press", "Moka Pot", "Kalita", "Cold Brew"];

/** Tasting entries / reviews — the social + journal feed. */
export const TASTINGS: Tasting[] = [
  { id: "t1", userId: "u2", beanId: "b7", rating: 5, brew: "V60", dose: "15g", ratio: "1:16", temp: "94°C",
    note: "Genuinely one of the best naturals I've had this year. Smells like a blueberry muffin, drinks like a floral syrup. The sweetness lingers for a full minute after the sip. Unreal.",
    likes: 142, comments: 23, time: "2h", mine: false },
  { id: "t2", userId: "u1", beanId: "b1", rating: 5, brew: "Chemex", dose: "30g", ratio: "1:15", temp: "93°C",
    note: "Dialed this in over the weekend. First two cups were thin but bumping the dose unlocked it — jasmine on the nose, that classic Yirgacheffe black-tea finish. A keeper.",
    likes: 38, comments: 6, time: "5h", mine: true },
  { id: "t3", userId: "u4", beanId: "b4", rating: 5, brew: "Kalita", dose: "22g", ratio: "1:16", temp: "95°C",
    note: "Kenyan AB doing Kenyan AB things. Blackcurrant, tomato-leaf savoriness, and acidity that makes your cheeks tingle. Not for the faint of heart.",
    likes: 89, comments: 14, time: "8h", mine: false },
  { id: "t4", userId: "u3", beanId: "b3", rating: 4, brew: "Espresso", dose: "18g", ratio: "1:2", temp: "—",
    note: "Pulled as a 36g shot in 28s. Big cocoa and toffee, holds up beautifully with oat milk. My new house espresso for the season.",
    likes: 51, comments: 9, time: "1d", mine: false },
  { id: "t5", userId: "u1", beanId: "b3", rating: 4, brew: "AeroPress", dose: "16g", ratio: "1:14", temp: "88°C",
    note: "Lower temp inverted method. Smooth, chocolatey, zero bitterness. The reliable weekday cup — nothing flashy but always good.",
    likes: 22, comments: 3, time: "2d", mine: true },
  { id: "t6", userId: "u5", beanId: "b6", rating: 4, brew: "French Press", dose: "30g", ratio: "1:15", temp: "96°C",
    note: "Rainy Sunday energy. Earthy, syrupy, tastes like dark cocoa and cedar. Sometimes you don't want bright and fruity — you want a blanket in a mug.",
    likes: 34, comments: 5, time: "2d", mine: false },
  { id: "t7", userId: "u2", beanId: "b2", rating: 4, brew: "V60", dose: "15g", ratio: "1:16", temp: "92°C",
    note: "Pink Bourbon honey — the body on this is unreal, almost syrupy. Red apple and brown sugar. Lost half a point only because it faded as it cooled.",
    likes: 67, comments: 11, time: "3d", mine: false },
  { id: "t8", userId: "u1", beanId: "b7", rating: 5, brew: "V60", dose: "14g", ratio: "1:16", temp: "94°C",
    note: "Revisited the Idido on a cleaner grinder and wow. The blueberry is so pronounced it's almost comical. Bookmarking this roaster forever.",
    likes: 45, comments: 8, time: "4d", mine: true },
];

/** Tastings the current user (u1) has liked at seed time. */
export const LIKED_SEED: Array<{ userId: string; tastingId: string }> = [
  { userId: "u1", tastingId: "t1" },
  { userId: "u1", tastingId: "t3" },
];
