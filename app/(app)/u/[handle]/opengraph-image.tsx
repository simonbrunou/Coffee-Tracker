import { ImageResponse } from "next/og";
import { getUserProfileByHandleCached } from "@/lib/queries";
import { THEME_LIGHT } from "@/lib/theme-colors";

export const dynamic = "force-dynamic"; // reads the DB per request
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Cortado profile";

export default async function UserOg({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const profile = await getUserProfileByHandleCached(null, decodeURIComponent(handle));
  // Gate on discoverable so a non-discoverable user's name/handle is never served
  // as a crawlable PNG that bypasses the profile's noindex.
  if (!profile || !profile.discoverable) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: THEME_LIGHT, color: "#2b2420" }}>
          <div style={{ fontSize: 96, fontWeight: 700 }}>Cortado</div>
          <div style={{ fontSize: 36, marginTop: 12, opacity: 0.7 }}>Coffee Journal</div>
        </div>
      ),
      { ...size },
    );
  }
  const initial = (profile.name.trim()[0] ?? "?").toUpperCase();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: 48, padding: 80, background: THEME_LIGHT, color: "#2b2420" }}>
        <div style={{ width: 220, height: 220, borderRadius: "50%", background: profile.avatar, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 120, fontWeight: 700 }}>
          {initial}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 72, fontWeight: 700 }}>{profile.name}</div>
          <div style={{ fontSize: 36, opacity: 0.7, marginTop: 8 }}>{`@${profile.handle}`}</div>
          <div style={{ fontSize: 32, opacity: 0.6, marginTop: 18 }}>{`${profile.tastings} tastings · Cortado`}</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
