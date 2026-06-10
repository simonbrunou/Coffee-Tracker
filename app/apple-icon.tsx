import { ImageResponse } from "next/og";

// A separate route segment: the root force-dynamic does NOT cascade here. No DB
// / no request APIs → force-static prerenders /apple-icon at the no-DB build.
// Mirrors app/opengraph-image.tsx. Hex literals only (satori can't resolve
// var(--*)); text-free bean from app/icon.svg. Next auto-injects the
// apple-touch-icon <link> (the hash in the link URL is fine here).
export const dynamic = "force-static";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#3a2a1e",
        }}
      >
        <svg width={150} height={150} viewBox="0 0 32 32">
          <g transform="translate(16 16)">
            <ellipse cx={0} cy={0} rx={7} ry={10} transform="rotate(35)" fill="#c08a45" />
            <path d="M -5 -6 Q 0 0 5 6" stroke="rgba(255,255,255,0.6)" strokeWidth={1.6} fill="none" strokeLinecap="round" transform="rotate(35)" />
          </g>
        </svg>
      </div>
    ),
    { ...size },
  );
}
