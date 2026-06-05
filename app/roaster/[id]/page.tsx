"use client";
import { useParams, useRouter } from "next/navigation";
import { RoasterDetail } from "@/components/detail";
import { useShell } from "@/components/app-provider";

export default function RoasterPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const s = useShell();
  return <RoasterDetail roasterId={id} onBack={() => router.back()} onOpenBean={s.openBean} />;
}
