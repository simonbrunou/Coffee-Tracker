// Code-generated PWA icon set → public/icons/*.png. Run once during execution;
// the resulting PNGs are committed (stable, manifest-referenceable URLs).
//
// R1: import from "next/og.js" (NOT "next/og") — next ships no `exports` map, so
//     ESM in a standalone .mjs needs the explicit extension or it throws
//     ERR_MODULE_NOT_FOUND. The only correct fallback is
//     "next/dist/compiled/@vercel/og/index.node.js".
// satori (next/og) cannot resolve var(--*) or render <text>/emoji/woff2 — so the
// bean is drawn with hex literals (matching app/icon.svg), text-free.
import { ImageResponse } from "next/og.js";
import { createElement as h } from "react";
import { mkdirSync, writeFileSync } from "node:fs";

// Brand bean on a full-bleed #3a2a1e field. `inset` shrinks the bean's svg box
// so the maskable variant keeps its tip inside the platform safe zone.
function bean(size, inset) {
  const d = Math.round(size * (1 - inset)); // bean svg box edge
  return h(
    "div",
    {
      style: {
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#3a2a1e",
      },
    },
    h(
      "svg",
      { width: d, height: d, viewBox: "0 0 32 32" },
      h(
        "g",
        { transform: "translate(16 16)" },
        h("ellipse", { cx: 0, cy: 0, rx: 7, ry: 10, transform: "rotate(35)", fill: "#c08a45" }),
        h("path", {
          d: "M -5 -6 Q 0 0 5 6",
          stroke: "rgba(255,255,255,0.6)",
          strokeWidth: 1.6,
          fill: "none",
          strokeLinecap: "round",
          transform: "rotate(35)",
        }),
      ),
    ),
  );
}

async function png(node, size) {
  const res = new ImageResponse(node, { width: size, height: size });
  return Buffer.from(await res.arrayBuffer());
}

mkdirSync("public/icons", { recursive: true });
// inset 0.04 → bean ~52% of canvas; maskable 0.16 → bean tip well inside the
// 40%-radius safe zone (R8).
writeFileSync("public/icons/icon-192.png", await png(bean(192, 0.04), 192));
writeFileSync("public/icons/icon-512.png", await png(bean(512, 0.04), 512));
writeFileSync("public/icons/maskable-512.png", await png(bean(512, 0.16), 512));
console.log("icons written to public/icons/");
