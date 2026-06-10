import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUserId } from "@/lib/auth";
import { getBeanCached, getBeanReviewsPage } from "@/lib/queries";
import { getPublicBaseUrl } from "@/lib/public-url";
import { beanJsonLd, breadcrumbJsonLd, serializeJsonLd } from "@/lib/json-ld";
import { beanMetadata } from "@/lib/seo";
import { BeanClient } from "./bean-client";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  // getBeanCached dedups with the page body's identical call (same request).
  return beanMetadata(await getBeanCached(await getCurrentUserId(), id), id);
}

// Server component: fetch the bean + its first page of reviews (scoped/paginated),
// emit JSON-LD, then hand off to a client wrapper that wires the shell handlers.
export default async function BeanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = await getCurrentUserId();
  const [bean, initialReviews] = await Promise.all([getBeanCached(uid, id), getBeanReviewsPage(uid, id, {})]);
  if (!bean) notFound(); // real 404 (not a soft-404 200) for a missing bean
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const base = getPublicBaseUrl();
  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        // Browsers strip the CSP nonce from the DOM after applying policy, so the
        // hydrated value ("") never matches the server's nonce. This attribute
        // mismatch is expected and benign for inline data scripts.
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd([
            beanJsonLd(bean, `${base}/bean/${id}`),
            breadcrumbJsonLd([
              { name: "Discover", url: `${base}/discover` },
              { name: bean.name, url: `${base}/bean/${id}` },
            ]),
          ]),
        }}
      />
      <BeanClient beanId={id} bean={bean} initialReviews={initialReviews} />
    </>
  );
}
