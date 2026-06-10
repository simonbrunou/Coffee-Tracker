import { ImageResponse } from "next/og";
import { THEME_LIGHT } from "@/lib/theme-colors";

// No DB / request APIs → safe to pre-render at build (and immune to the root
// layout's force-dynamic cascade).
export const dynamic = "force-static";
export const alt = "Cortado — Coffee Journal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgDefault() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: THEME_LIGHT,
          color: "#2b2420",
        }}
      >
        <div style={{ fontSize: 96, fontWeight: 700 }}>Cortado</div>
        <div style={{ fontSize: 36, marginTop: 12, opacity: 0.7 }}>Coffee Journal</div>
      </div>
    ),
    { ...size },
  );
}
