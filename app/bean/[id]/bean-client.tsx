"use client";
import { useRouter } from "next/navigation";
import { BeanDetail } from "@/components/detail";
import { useShell } from "@/components/app-provider";
import type { Bean, Page, Tasting } from "@/lib/types";

export function BeanClient({
  beanId,
  bean,
  initialReviews,
}: {
  beanId: string;
  bean: Bean | null;
  initialReviews: Page<Tasting>;
}) {
  const router = useRouter();
  const s = useShell();
  return (
    <BeanDetail
      beanId={beanId}
      bean={bean}
      initialReviews={initialReviews}
      onBack={() => (window.history.length > 1 ? router.back() : router.push("/"))}
      onOpenRoaster={s.openRoaster}
      likes={s.likes}
      onLike={s.toggleLike}
      onAdd={s.openBrew}
      onEditBag={s.openEditBag}
      onDeleteBag={s.deleteBag}
    />
  );
}
