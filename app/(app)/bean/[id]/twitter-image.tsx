// Twitter card reuses the OG image. Next 16 / Turbopack can't statically parse
// route-segment config (`dynamic`) when it's re-exported, so declare it here and
// re-export only the rendering component.
export { default } from "./opengraph-image";

export const dynamic = "force-dynamic";
export const alt = "Coffee bean on Cortado";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
