"use client";
import { useRouter } from "next/navigation";
import { RoasterDetail } from "@/components/detail";
import { useShell } from "@/components/app-provider";
import type { Bean, Page } from "@/lib/types";

export function RoasterClient({ roasterId, initialBeans }: { roasterId: string; initialBeans: Page<Bean> }) {
  const router = useRouter();
  const s = useShell();
  return (
    <RoasterDetail
      roasterId={roasterId}
      initialBeans={initialBeans}
      onBack={() => (window.history.length > 1 ? router.back() : router.push("/discover"))}
      onOpenBean={s.openBean}
    />
  );
}
