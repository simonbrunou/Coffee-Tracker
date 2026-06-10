"use client";
import { RoasterDetail } from "@/components/detail";
import { useShell } from "@/components/app-provider";
import { useBackOr } from "@/components/use-back-or";
import type { Bean, Page } from "@/lib/types";

export function RoasterClient({ roasterId, initialBeans }: { roasterId: string; initialBeans: Page<Bean> }) {
  const s = useShell();
  const onBack = useBackOr("/discover");
  return (
    <RoasterDetail
      roasterId={roasterId}
      initialBeans={initialBeans}
      onBack={onBack}
      onOpenBean={s.openBean}
    />
  );
}
