import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUserId } from "@/lib/auth";
import { getUserProfileByHandleCached, getUserTastingsPage, getTopFlavors } from "@/lib/queries";
import { getPublicBaseUrl } from "@/lib/public-url";
import { personJsonLd, serializeJsonLd } from "@/lib/json-ld";
import { userMetadata } from "@/lib/seo";
import { UserProfileClient } from "./user-profile-client";

// This route lives UNDER (app) on purpose: TastingCard (rendered by ProfileView)
// calls useShell(), which requires AppProvider. Do not move it out of (app).
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const raw = decodeURIComponent(handle);
  return userMetadata(await getUserProfileByHandleCached(await getCurrentUserId(), raw), raw);
}

export default async function UserProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const raw = decodeURIComponent(handle);
  const uid = await getCurrentUserId();
  const profile = await getUserProfileByHandleCached(uid, raw);
  if (!profile) notFound(); // real 404 (soft under the streaming shell; metadata noindex covers it)
  // 308 to the canonical stored case. The 308 supersedes the already-computed
  // metadata for the non-canonical URL (Next discards the page render on a
  // component redirect), so don't "fix" generateMetadata into a noindex-on-redirect.
  if (raw !== profile.handle) permanentRedirect(`/u/${profile.handle}`);
  const [tastings, topFlavors] = await Promise.all([
    getUserTastingsPage(uid, profile.id, {}),
    getTopFlavors(profile.id),
  ]);
  const isOwn = uid === profile.id;
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const base = getPublicBaseUrl();
  return (
    <>
      {profile.discoverable && (
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(personJsonLd(profile, `${base}/u/${profile.handle}`)) }}
        />
      )}
      <UserProfileClient profile={profile} initialTastings={tastings} topFlavors={topFlavors} isOwn={isOwn} />
    </>
  );
}
