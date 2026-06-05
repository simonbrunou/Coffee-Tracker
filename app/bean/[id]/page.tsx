"use client";
import { useParams, useRouter } from "next/navigation";
import { BeanDetail } from "@/components/detail";
import { useShell } from "@/components/app-provider";

export default function BeanPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const s = useShell();
  return (
    <BeanDetail
      beanId={id}
      onBack={() => router.back()}
      onOpenRoaster={s.openRoaster}
      likes={s.likes}
      onLike={s.toggleLike}
      onAdd={s.openBrew}
    />
  );
}
