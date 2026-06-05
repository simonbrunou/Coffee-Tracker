"use client";
import { useParams, useRouter } from "next/navigation";
import { RoasterDetail } from "@/components/detail";
import { useShell } from "@/components/app-provider";

export default function RoasterPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const s = useShell();
  return (
    <RoasterDetail
      roasterId={id}
      onBack={() => (window.history.length > 1 ? router.back() : router.push("/discover"))}
      onOpenBean={s.openBean}
    />
  );
}
