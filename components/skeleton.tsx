import type { CSSProperties } from "react";

/** Shared skeleton block — a surface placeholder with a CSS shimmer sweep
 *  (see `.skeleton` in globals.css; reduced-motion neutralizes the sweep).
 *  Every loading.tsx composes this so the cold-open → tap transition is
 *  visually consistent. Decorative → aria-hidden (the fallback container owns
 *  the role="status"/aria-label). */
export function Skeleton({
  w,
  h,
  r = 10,
  style,
}: {
  w?: number | string;
  h?: number | string;
  r?: number | string;
  style?: CSSProperties;
}) {
  return <div className="skeleton" aria-hidden="true" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}
