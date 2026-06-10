"use client";
import { BeanDetail } from "@/components/detail";
import { useShell } from "@/components/app-provider";
import { useBackOr } from "@/components/use-back-or";
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
  const s = useShell();
  const onBack = useBackOr("/");
  return (
    <BeanDetail
      beanId={beanId}
      bean={bean}
      initialReviews={initialReviews}
      onBack={onBack}
      onOpenRoaster={s.openRoaster}
      likes={s.likes}
      onLike={s.toggleLike}
      onAdd={s.openBrew}
      onEditBag={s.openEditBag}
      onDeleteBag={s.deleteBag}
    />
  );
}
