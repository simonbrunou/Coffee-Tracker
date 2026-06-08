import { ImageResponse } from "next/og";
import { getBeanCached } from "@/lib/queries";

// force-dynamic: reads the DB per request (and `next build` has no DB). Keep the
// default nodejs runtime — pg is node-only; the edge runtime would break it.
export const dynamic = "force-dynamic";
export const alt = "Coffee bean on Cortado";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function BeanOg({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bean = await getBeanCached(null, id); // null viewer — catalog fields only, no auth hit
  const title = bean?.name ?? "Cortado";
  const sub = bean ? [bean.roasterName, bean.origin].filter(Boolean).join(" · ") : "Coffee Journal";
  const rating = bean && bean.ratings > 0 ? `${bean.avgRating.toFixed(1)} / 5` : "";
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
          background: "#f4ece1",
          color: "#2b2420",
        }}
      >
        <div style={{ fontSize: 32, opacity: 0.7 }}>Cortado</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>{title}</div>
          <div style={{ fontSize: 38, marginTop: 16, opacity: 0.75 }}>{sub}</div>
        </div>
        <div style={{ fontSize: 44, fontWeight: 700, color: "#7a4f2a" }}>{rating}</div>
      </div>
    ),
    { ...size },
  );
}
