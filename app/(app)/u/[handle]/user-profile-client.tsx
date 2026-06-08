"use client";
import { ProfileView } from "@/components/detail";
import { useShell } from "@/components/app-provider";
import { loadMoreUserTastings } from "@/app/actions";
import type { PublicProfile, Page, Tasting } from "@/lib/types";

export function UserProfileClient({ profile, initialTastings, topFlavors, isOwn }: {
  profile: PublicProfile;
  initialTastings: Page<Tasting>;
  topFlavors: { flavor: string; n: number }[];
  isOwn: boolean;
}) {
  const s = useShell();
  return (
    <ProfileView
      user={profile}
      initialTastings={initialTastings}
      topFlavors={topFlavors}
      isOwn={isOwn}
      isFollowing={s.followedUsers.has(profile.id)}
      onFollow={() => s.toggleFollowUser(profile.id)}
      likes={s.likes}
      onLike={s.toggleLike}
      onOpenBean={s.openBean}
      loadMore={(cursor) => loadMoreUserTastings(profile.id, cursor)}
    />
  );
}
