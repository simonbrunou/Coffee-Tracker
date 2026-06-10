import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUserId } from "@/lib/auth";
import { getRoasterByIdCached, getRoasterBeansPage } from "@/lib/queries";
import { getPublicBaseUrl } from "@/lib/public-url";
import { roasterJsonLd, breadcrumbJsonLd, serializeJsonLd } from "@/lib/json-ld";
import { roasterMetadata } from "@/lib/seo";
import { RoasterClient } from "./roaster-client";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return roasterMetadata(await getRoasterByIdCached(await getCurrentUserId(), id), id);
}

// Server component: fetch the roaster's first page of beans (keyset). The roaster
// identity is fetched server-side ONLY for metadata/JSON-LD/notFound; the client
// body still resolves it from the provider (D.roaster) for rendering.
export default async function RoasterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await getCurrentUserId();
  const [roaster, initialBeans] = await Promise.all([getRoasterByIdCached(uid, id), getRoasterBeansPage(uid, id, {})]);
  if (!roaster) notFound(); // real 404 for a missing roaster
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const base = getPublicBaseUrl();
  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        // Browser strips the CSP nonce post-policy; the hydrated "" never matches
        // the server nonce. Benign attribute mismatch for inline data scripts.
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd([
            roasterJsonLd(roaster, `${base}/roaster/${id}`),
            breadcrumbJsonLd([{ name: roaster.name, url: `${base}/roaster/${id}` }]),
          ]),
        }}
      />
      <RoasterClient roasterId={id} initialBeans={initialBeans} />
    </>
  );
}
