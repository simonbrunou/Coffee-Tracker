import { ImageResponse } from "next/og";
import { getRoasterByIdCached } from "@/lib/queries";
import { THEME_LIGHT } from "@/lib/theme-colors";

// force-dynamic: reads the DB per request. Keep the default nodejs runtime — pg
// is node-only; the edge runtime would break it.
export const dynamic = "force-dynamic";
export const alt = "Roaster on Cortado";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function RoasterOg({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getRoasterByIdCached(null, id); // null viewer — catalog fields only
  const title = r?.name ?? "Cortado";
  const sub = r?.city ? r.city : "Roaster";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: THEME_LIGHT,
          color: "#2b2420",
        }}
      >
        <div style={{ fontSize: 32, opacity: 0.7 }}>Cortado</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>{title}</div>
          <div style={{ fontSize: 38, marginTop: 16, opacity: 0.75 }}>{sub}</div>
        </div>
        <div style={{ fontSize: 30, opacity: 0.6 }}>Roaster</div>
      </div>
    ),
    { ...size },
  );
}
